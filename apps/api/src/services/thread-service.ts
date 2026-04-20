import { and, eq, desc, inArray, isNull, sql } from 'drizzle-orm'
import { emails, threads } from '@wistmail/db'
import { generateId } from '@wistmail/shared'
import type { Database } from '@wistmail/db'

/// Threading lives in a dedicated service so the logic stays
/// testable on its own and the email receive/compose paths don't
/// balloon. Call sites are narrow:
///   • EmailReceiver — every inbound message resolves or creates a
///     thread before the email row lands.
///   • compose (reply path) — uses the inReplyTo chain to keep the
///     user's draft stitched to the same thread.
///   • Inbox detail — siblings for a thread-expanded view.
///
/// The matching rules follow RFC 5322 conventions:
///   1. Prefer `inReplyTo` matching an existing email's messageId
///      (or `references` touching one) → use that email's threadId.
///   2. Otherwise fall back to subject-based grouping within the
///      same mailbox — strip "Re:" / "Fwd:" prefixes and look for a
///      thread whose normalised subject matches. This catches stale
///      reply chains where the client didn't set inReplyTo.
///   3. Otherwise start a fresh thread.

export class ThreadService {
  constructor(private readonly db: Database) {}

  /// Normalise a subject for matching — strip all "Re:" / "Fwd:"
  /// prefixes, collapse whitespace, lowercase. Done in JS rather
  /// than SQL so the match is identical across every call site and
  /// we don't need a generated column on `threads`.
  static normaliseSubject(subject: string): string {
    let s = subject.trim()
    while (true) {
      const m = s.match(/^(re|fw|fwd)\s*:?\s*/i)
      if (!m) break
      s = s.slice(m[0].length)
    }
    return s.replace(/\s+/g, ' ').toLowerCase()
  }

  /// Resolve (or create) the thread an email belongs to. Inserts /
  /// updates the thread row; returns its id. The caller is expected
  /// to set `emails.thread_id = threadId` when inserting the email
  /// row.
  async assignThread(params: {
    mailboxId: string
    subject: string
    fromAddress: string
    toAddresses: string[]
    cc: string[]
    inReplyTo: string | null
    references: string[]
    createdAt: Date
  }): Promise<string> {
    const { mailboxId, subject, createdAt } = params

    // Step 1 — inReplyTo / references chain.
    const referencedMessageIds = [
      ...(params.inReplyTo ? [params.inReplyTo] : []),
      ...params.references,
    ].filter(Boolean)
    if (referencedMessageIds.length > 0) {
      const referenced = await this.db
        .select({ threadId: emails.threadId })
        .from(emails)
        .where(
          and(
            eq(emails.mailboxId, mailboxId),
            inArray(emails.messageId, referencedMessageIds),
          ),
        )
        .limit(1)
      const existing = referenced[0]?.threadId
      if (existing) {
        await this.bumpThread(existing, params)
        return existing
      }
    }

    // Step 2 — subject-based match within mailbox. Only match threads
    // whose last email was within the last 30 days; "Marketing"
    // threads that fire once a year should NOT all collapse into one.
    const normalised = ThreadService.normaliseSubject(subject)
    if (normalised.length > 0) {
      const thirtyDaysAgo = new Date(
        createdAt.getTime() - 30 * 24 * 60 * 60 * 1000,
      )
      const candidates = await this.db
        .select({ id: threads.id, subject: threads.subject })
        .from(threads)
        .where(
          and(
            eq(threads.mailboxId, mailboxId),
            sql`${threads.lastEmailAt} >= ${thirtyDaysAgo}`,
          ),
        )
        .orderBy(desc(threads.lastEmailAt))
        .limit(50)
      const match = candidates.find(
        (c) => ThreadService.normaliseSubject(c.subject) === normalised,
      )
      if (match) {
        await this.bumpThread(match.id, params)
        return match.id
      }
    }

    // Step 3 — fresh thread.
    const id = generateId('thr')
    await this.db.insert(threads).values({
      id,
      subject: subject || '(no subject)',
      lastEmailAt: createdAt,
      mailboxId,
      participantAddresses: Array.from(
        new Set(
          [
            params.fromAddress,
            ...params.toAddresses,
            ...params.cc,
          ].filter((x) => !!x),
        ),
      ),
      emailCount: 1,
    })
    return id
  }

  private async bumpThread(
    threadId: string,
    params: {
      fromAddress: string
      toAddresses: string[]
      cc: string[]
      createdAt: Date
    },
  ): Promise<void> {
    // Merge participants. We keep this in JS rather than a jsonb
    // SQL concat because the list is small (typically < 20) and
    // doing it here gives us dedup + order preservation without
    // writing an array_agg CTE.
    const row = await this.db
      .select({
        participants: threads.participantAddresses,
        emailCount: threads.emailCount,
      })
      .from(threads)
      .where(eq(threads.id, threadId))
      .limit(1)
    if (row.length === 0) return
    const current = row[0].participants ?? []
    const merged = Array.from(
      new Set(
        [
          ...current,
          params.fromAddress,
          ...params.toAddresses,
          ...params.cc,
        ].filter((x) => !!x),
      ),
    )
    await this.db
      .update(threads)
      .set({
        lastEmailAt: params.createdAt,
        emailCount: (row[0].emailCount ?? 0) + 1,
        participantAddresses: merged,
      })
      .where(eq(threads.id, threadId))
  }

  /// Return every email in the same thread as `emailId`, ordered
  /// oldest → newest. Used by the thread-expanded detail view so
  /// the client can render the full conversation without N+1.
  /// `_userId` is accepted as a marker — the caller must already
  /// have authorised the anchor email belongs to this user, and
  /// we rely on mailbox-id scoping below to enforce that.
  async listThreadEmails(
    emailId: string,
    _userId: string,
  ): Promise<Array<typeof emails.$inferSelect>> {
    // Resolve the thread via the caller's email. The userId/mailbox
    // join prevents leaking another user's thread.
    const anchor = await this.db
      .select({ threadId: emails.threadId, mailboxId: emails.mailboxId })
      .from(emails)
      .where(eq(emails.id, emailId))
      .limit(1)
    if (anchor.length === 0 || !anchor[0].threadId) return []
    return this.db
      .select()
      .from(emails)
      .where(
        and(
          eq(emails.threadId, anchor[0].threadId),
          eq(emails.mailboxId, anchor[0].mailboxId),
        ),
      )
      .orderBy(emails.createdAt)
  }

  /// Backfill thread ids for every email in a mailbox that doesn't
  /// have one yet. Intended to be run once after a deploy that adds
  /// threading to a previously-threadless DB; idempotent because
  /// each call only touches rows with threadId IS NULL.
  async backfill(mailboxId: string): Promise<number> {
    const toBackfill = await this.db
      .select()
      .from(emails)
      .where(and(eq(emails.mailboxId, mailboxId), isNull(emails.threadId)))
      .orderBy(emails.createdAt)
    let bumped = 0
    for (const row of toBackfill) {
      const threadId = await this.assignThread({
        mailboxId: row.mailboxId,
        subject: row.subject,
        fromAddress: row.fromAddress,
        toAddresses: row.toAddresses ?? [],
        cc: row.cc ?? [],
        inReplyTo: row.inReplyTo ?? null,
        references: row.references ?? [],
        createdAt: row.createdAt,
      })
      await this.db.update(emails).set({ threadId }).where(eq(emails.id, row.id))
      bumped++
    }
    return bumped
  }
}
