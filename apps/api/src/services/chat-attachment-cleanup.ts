/// Orphan-attachment cleanup. The chat upload flow is two-step:
/// `POST /chat/attachments` writes bytes + a row with `messageId =
/// null`; the subsequent send call claims the row by stamping
/// messageId. If the user uploads but never sends — closed the
/// composer, lost the network — the row + bytes linger. This service
/// reaps them on a schedule.
///
/// Threshold is conservative (24h by default) so a slow user who
/// stages an attachment, walks away, and comes back the next morning
/// to finish typing doesn't lose it. Tweak via env if your usage
/// demands a tighter window.

import { and, isNull, lt } from 'drizzle-orm'
import { chatAttachments } from '@wistmail/db'
import type { Database } from '@wistmail/db'
import { deleteAttachmentBytes } from '../lib/attachment-storage.js'

const ORPHAN_AGE_MS = (() => {
  const env = parseInt(process.env.CHAT_ATTACHMENT_ORPHAN_TTL_MS ?? '', 10)
  return Number.isFinite(env) && env > 0 ? env : 24 * 60 * 60 * 1000
})()

/// Sweeps unclaimed attachment rows older than the orphan TTL.
/// Returns counts so callers can log a single line per run rather
/// than one per row.
export async function cleanupOrphanChatAttachments(
  db: Database,
  now: Date = new Date(),
): Promise<{ rowsDeleted: number; bytesDeleted: number }> {
  const cutoff = new Date(now.getTime() - ORPHAN_AGE_MS)
  const orphans = await db
    .select({ id: chatAttachments.id })
    .from(chatAttachments)
    .where(
      and(
        isNull(chatAttachments.messageId),
        lt(chatAttachments.createdAt, cutoff),
      ),
    )
  if (orphans.length === 0) return { rowsDeleted: 0, bytesDeleted: 0 }

  let bytesDeleted = 0
  for (const o of orphans) {
    // Best-effort byte delete first, then DB. If the file is
    // already missing we still drop the row — the stat would have
    // been on us anyway. We don't fail the sweep on individual
    // disk errors; one bad file shouldn't block GC.
    const ok = await deleteAttachmentBytes(o.id).catch(() => false)
    if (ok) bytesDeleted++
  }
  // CASCADE-on-delete isn't required here (chat_attachments has no
  // child rows), so a single delete-by-ids does the job.
  await db
    .delete(chatAttachments)
    .where(
      and(
        isNull(chatAttachments.messageId),
        lt(chatAttachments.createdAt, cutoff),
      ),
    )
  return { rowsDeleted: orphans.length, bytesDeleted }
}

/// Periodic timer wrapper. Runs every `intervalMs` (default 1h) until
/// the returned `stop()` is called. Logs counts; swallows errors so a
/// transient DB hiccup doesn't kill the timer.
export function startChatAttachmentCleanup(
  db: Database,
  intervalMs: number = 60 * 60 * 1000,
): { stop: () => void } {
  const timer = setInterval(() => {
    cleanupOrphanChatAttachments(db)
      .then((res) => {
        if (res.rowsDeleted > 0) {
          console.log(
            `[chat-attachments] swept ${res.rowsDeleted} orphan rows (${res.bytesDeleted} files)`,
          )
        }
      })
      .catch((err) => console.error('[chat-attachments] sweep failed:', err))
  }, intervalMs)
  // unref so a stuck cleanup loop never blocks process shutdown.
  if (typeof timer.unref === 'function') timer.unref()
  return { stop: () => clearInterval(timer) }
}
