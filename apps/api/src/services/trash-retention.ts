import { and, eq, inArray, lt, sql } from 'drizzle-orm'
import { attachments, emails, mailboxes } from '@wistmail/db'
import type { Database } from '@wistmail/db'
import { deleteAttachmentBytes } from '../lib/attachment-storage.js'

/// How long a row stays in Trash before we hard-delete it. 30 days is
/// the Gmail default — long enough that accidental deletes can be
/// recovered, short enough that users aren't surprised when old
/// trash disappears.
///
/// Configurable via env for tests and for operators who want a
/// different policy (e.g. enterprise requires 7-day trash purge).
export const TRASH_RETENTION_DAYS: number = readDaysEnv(
  'TRASH_RETENTION_DAYS',
  30,
)

/// Same idea for Spam. Spam retention is typically shorter than
/// trash in commercial clients (quarantine is disposable); we mirror
/// Gmail's 30-day default and let operators shorten it if they want.
export const SPAM_RETENTION_DAYS: number = readDaysEnv(
  'SPAM_RETENTION_DAYS',
  30,
)

function readDaysEnv(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const n = parseInt(raw, 10)
  if (!Number.isFinite(n) || n < 1) return fallback
  return n
}

/// Hard-delete every email currently in Trash whose `updatedAt` is
/// older than the retention window. We use `updatedAt` rather than
/// `createdAt` so the clock starts when the user deleted the message,
/// not when it was received. Attachments are purged from disk too —
/// otherwise a long-lived deployment slowly accumulates orphan bytes.
///
/// Returns counts for logging / metrics.
export function purgeExpiredTrash(
  db: Database,
  now: Date = new Date(),
): Promise<{ purgedEmails: number; purgedBytes: number }> {
  return purgeExpiredFolder(db, 'trash', TRASH_RETENTION_DAYS, now)
}

/// Same mechanic for Spam — quarantine isn't meant to live forever.
/// Separate retention constant so operators can be stricter on spam
/// without shortening user-facing trash.
export function purgeExpiredSpam(
  db: Database,
  now: Date = new Date(),
): Promise<{ purgedEmails: number; purgedBytes: number }> {
  return purgeExpiredFolder(db, 'spam', SPAM_RETENTION_DAYS, now)
}

async function purgeExpiredFolder(
  db: Database,
  folder: string,
  retentionDays: number,
  now: Date,
): Promise<{ purgedEmails: number; purgedBytes: number }> {
  const cutoff = new Date(
    now.getTime() - retentionDays * 24 * 60 * 60 * 1000,
  )

  // One query gets the expired email ids; we then fetch their
  // attachment ids so we can clean up disk before deleting rows. If
  // we delete the rows first, a crash mid-purge would leave orphaned
  // bytes we can never reconcile.
  const expiredIds = (
    await db
      .select({ id: emails.id })
      .from(emails)
      .where(and(eq(emails.folder, folder), lt(emails.updatedAt, cutoff)))
      .limit(500) // cap each tick so we don't stall on a huge backlog
  ).map((r) => r.id)

  if (expiredIds.length === 0) return { purgedEmails: 0, purgedBytes: 0 }

  const attRows = await db
    .select({ id: attachments.id, sizeBytes: attachments.sizeBytes })
    .from(attachments)
    .where(inArray(attachments.emailId, expiredIds))

  // Disk first — ignore ENOENT, log anything else but keep going.
  // Accumulating bytes for the metric.
  let purgedBytes = 0
  for (const a of attRows) {
    try {
      const removed = await deleteAttachmentBytes(a.id)
      if (removed) purgedBytes += a.sizeBytes
    } catch (err) {
      console.error(
        `[retention] failed to unlink attachment ${a.id}:`,
        err,
      )
    }
  }

  // Drop the email rows — the FK cascade takes care of attachments /
  // email_labels / anything else referencing emails.id.
  await db.delete(emails).where(inArray(emails.id, expiredIds))

  return { purgedEmails: expiredIds.length, purgedBytes }
}

/// Hard-delete every email in Trash for a single user. Used by the
/// "Empty trash" button — same semantics as the cron purge but scoped
/// and not retention-gated.
export function emptyTrashForUser(
  db: Database,
  userId: string,
): Promise<{ purgedEmails: number; purgedBytes: number }> {
  return emptyFolderForUser(db, userId, 'trash')
}

/// Generic "empty a folder" helper. Same teardown as emptyTrashForUser
/// (disk attachments first, then row delete) but works against any
/// folder name. The "Empty spam" UI uses this with folder='spam'; we
/// refuse to run it against inbox/archive/sent/drafts where the user
/// would almost certainly regret the call.
const EMPTYABLE_FOLDERS = new Set<string>(['trash', 'spam'])

export async function emptyFolderForUser(
  db: Database,
  userId: string,
  folder: string,
): Promise<{ purgedEmails: number; purgedBytes: number }> {
  if (!EMPTYABLE_FOLDERS.has(folder)) {
    throw new Error(`Refusing to bulk-empty folder: ${folder}`)
  }
  const mailboxIds = (
    await db
      .select({ id: mailboxes.id })
      .from(mailboxes)
      .where(eq(mailboxes.userId, userId))
  ).map((m) => m.id)

  if (mailboxIds.length === 0) return { purgedEmails: 0, purgedBytes: 0 }

  const targetIds = (
    await db
      .select({ id: emails.id })
      .from(emails)
      .where(
        and(eq(emails.folder, folder), inArray(emails.mailboxId, mailboxIds)),
      )
  ).map((r) => r.id)

  if (targetIds.length === 0) return { purgedEmails: 0, purgedBytes: 0 }

  const attRows = await db
    .select({ id: attachments.id, sizeBytes: attachments.sizeBytes })
    .from(attachments)
    .where(inArray(attachments.emailId, targetIds))

  let purgedBytes = 0
  for (const a of attRows) {
    try {
      const removed = await deleteAttachmentBytes(a.id)
      if (removed) purgedBytes += a.sizeBytes
    } catch (err) {
      console.error(
        `[retention] failed to unlink attachment ${a.id}:`,
        err,
      )
    }
  }

  await db.delete(emails).where(inArray(emails.id, targetIds))
  return { purgedEmails: targetIds.length, purgedBytes }
}

/// Hard-delete a single email, but only if it's already in Trash and
/// belongs to the user. The two-folder-check is deliberate: we don't
/// want the "permanently delete" endpoint to bypass the trash step
/// for a fresh row in inbox — that would be too destructive.
export async function purgeOneFromTrash(
  db: Database,
  emailId: string,
  userId: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: emails.id, folder: emails.folder })
    .from(emails)
    .innerJoin(mailboxes, eq(emails.mailboxId, mailboxes.id))
    .where(and(eq(emails.id, emailId), eq(mailboxes.userId, userId)))
    .limit(1)

  if (rows.length === 0 || rows[0].folder !== 'trash') return false

  const attRows = await db
    .select({ id: attachments.id })
    .from(attachments)
    .where(eq(attachments.emailId, emailId))

  for (const a of attRows) {
    try {
      await deleteAttachmentBytes(a.id)
    } catch (err) {
      console.error(
        `[trash-retention] failed to unlink attachment ${a.id}:`,
        err,
      )
    }
  }

  await db.delete(emails).where(eq(emails.id, emailId))
  return true
}

/// Background loop. Ticks once an hour — fast enough that a 30-day
/// policy is enforced with at most 1h of slack, slow enough that a
/// deployment with an empty trash spends effectively no CPU here.
/// Sweeps both Trash and Spam on each tick.
export function startTrashRetention(db: Database): { stop: () => void } {
  const INTERVAL_MS = 60 * 60 * 1000
  let stopped = false
  const run = async () => {
    if (stopped) return
    try {
      const trash = await purgeExpiredTrash(db)
      if (trash.purgedEmails > 0) {
        console.log(
          `[retention] purged ${trash.purgedEmails} trash emails (${(
            trash.purgedBytes /
            1024 /
            1024
          ).toFixed(1)} MB) older than ${TRASH_RETENTION_DAYS}d`,
        )
      }
      const spam = await purgeExpiredSpam(db)
      if (spam.purgedEmails > 0) {
        console.log(
          `[retention] purged ${spam.purgedEmails} spam emails (${(
            spam.purgedBytes /
            1024 /
            1024
          ).toFixed(1)} MB) older than ${SPAM_RETENTION_DAYS}d`,
        )
      }
    } catch (err) {
      console.error('[retention] tick failed:', err)
    }
  }
  // First tick on a short delay so boot logs aren't polluted.
  const kickoff = setTimeout(run, 60_000)
  const interval = setInterval(run, INTERVAL_MS)
  return {
    stop: () => {
      stopped = true
      clearTimeout(kickoff)
      clearInterval(interval)
    },
  }
}

/// Unused but kept for SQL parity — helpful when writing one-off
/// admin queries.
export const trashRetentionCutoffSql = (now: Date = new Date()) =>
  sql<Date>`${new Date(now.getTime() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000)}`
