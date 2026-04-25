import { eq, and, desc, gt, ilike, isNull, lte, or, sql, inArray } from 'drizzle-orm'
import { readFile } from 'node:fs/promises'
import { emails, attachments, mailboxes, labels, emailLabels } from '@wistmail/db'
import { generateId } from '@wistmail/shared'
import type { Database } from '@wistmail/db'
import { parseIcsSafely } from '../lib/ics.js'
import { pathForAttachment } from '../lib/attachment-storage.js'
import { ThreadService } from './thread-service.js'

const PREVIEW_CHARS = 200

/// Compact label reference the inbox row needs for rendering — id,
/// name, colour. Full label objects (with mailboxId etc.) live behind
/// `GET /labels` and are only fetched when the user opens the label
/// settings / assign-popover flows.
export interface EmailLabelRef {
  id: string
  name: string
  color: string
}

/// Slim row returned by listByFolder/search — never includes the full
/// text/html body. The detail view fetches the full record via getById.
/// Keep the shape exactly aligned with the client `EmailListItem` types
/// in apps/web (inbox/page.tsx) and apps/mobile (lib/features/mail/domain/email.dart).
export interface EmailListItem {
  id: string
  mailboxId: string
  fromAddress: string
  toAddresses: string[]
  cc: string[]
  subject: string
  snippet: string
  folder: string
  isRead: boolean
  isStarred: boolean
  isDraft: boolean
  hasAttachments: boolean
  sizeBytes: number
  /// Outbound lifecycle status. 'idle' for inbound + drafts, the
  /// drafts-as-outbox states for everything you've tried to send.
  status: 'idle' | 'sending' | 'sent' | 'failed' | 'rate_limited'
  /// Last mail-engine error if status is 'failed' or 'rate_limited'.
  sendError: string | null
  /// Server-side mutation timestamp. Used by clients for last-write-
  /// wins reconciliation when WS events race local optimistic state.
  updatedAt: string
  createdAt: string
  /// Labels assigned to this email. Baked into the list response so the
  /// inbox row renderer never has to fire a per-row fetch — that was
  /// the old N+1 pattern (50 rows ⇒ 50 `/labels/email/:id` calls).
  labels: EmailLabelRef[]
  /// Thread id the email belongs to. Clients can use this to group
  /// rows in the list view, or to fetch the full conversation via
  /// `GET /inbox/emails/:id/thread`. Null on rows that predate the
  /// threading backfill — the UI falls back to treating those as
  /// single-message threads.
  threadId: string | null
}

export interface EmailListPage {
  data: EmailListItem[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
}

/// Cleans common HTML noise out of the textBody substring so the snippet
/// reads naturally. We don't strip everything (that's the renderer's job)
/// — just collapse whitespace and chop off after PREVIEW_CHARS.
function buildSnippet(textBody: string | null): string {
  if (!textBody) return ''
  const collapsed = textBody.replace(/\s+/g, ' ').trim()
  if (collapsed.length <= PREVIEW_CHARS) return collapsed
  return `${collapsed.slice(0, PREVIEW_CHARS)}…`
}

export class EmailService {
  constructor(private db: Database) {}

  private async resolveMailboxIds(userId: string): Promise<string[]> {
    const rows = await this.db
      .select({ id: mailboxes.id })
      .from(mailboxes)
      .where(eq(mailboxes.userId, userId))
    return rows.map((m) => m.id)
  }

  /// Batch-fetch label assignments for a page of emails. Returns a map
  /// keyed by email id so the row mappers can stitch labels in with a
  /// single lookup. One DB round-trip regardless of page size — beats
  /// the old pattern of the client firing one GET per row.
  private async hydrateLabels(
    emailIds: string[],
  ): Promise<Map<string, EmailLabelRef[]>> {
    const map = new Map<string, EmailLabelRef[]>()
    if (emailIds.length === 0) return map
    const rows = await this.db
      .select({
        emailId: emailLabels.emailId,
        id: labels.id,
        name: labels.name,
        color: labels.color,
      })
      .from(emailLabels)
      .innerJoin(labels, eq(labels.id, emailLabels.labelId))
      .where(inArray(emailLabels.emailId, emailIds))
    for (const r of rows) {
      const existing = map.get(r.emailId)
      const ref: EmailLabelRef = { id: r.id, name: r.name, color: r.color }
      if (existing) existing.push(ref)
      else map.set(r.emailId, [ref])
    }
    return map
  }

  /// Translate a folder name (literal or synthetic) into a WHERE clause
  /// against the user's mailboxes.
  ///
  /// Literal folders match `folder` directly. Synthetic folders derive
  /// from columns (`is_starred`, `snooze_until`, `scheduled_at`) so the
  /// sidebar links the web UI ships actually return data.
  ///
  /// `all` is the catch-all view — no folder filter, used by the
  /// "All Mail" pseudo-folder some users prefer.
  private buildFolderWhere(folder: string, mailboxIds: string[]) {
    const inMailbox = inArray(emails.mailboxId, mailboxIds)
    const now = new Date()
    switch (folder) {
      case 'starred':
        // Starred lives across folders — exclude trash so deleted starred
        // mail doesn't pollute the view.
        return and(
          inMailbox,
          eq(emails.isStarred, true),
          sql`${emails.folder} <> 'trash'`,
        )
      case 'snoozed':
        // Snoozed = currently hidden. The row reappears in inbox once
        // snooze_until passes (a separate housekeeping tick clears the
        // column when due — for now, the inbox folder simply excludes
        // snoozed rows; see the `inbox` branch below).
        return and(
          inMailbox,
          sql`${emails.snoozeUntil} IS NOT NULL`,
          gt(emails.snoozeUntil, now),
        )
      case 'scheduled':
        // Outbound mail with a future send time. Status is 'sending'
        // until the dispatcher picks it up at the scheduled moment.
        return and(
          inMailbox,
          sql`${emails.scheduledAt} IS NOT NULL`,
          gt(emails.scheduledAt, now),
        )
      case 'all':
        return inMailbox
      case 'inbox':
        // Inbox naturally hides currently-snoozed rows.
        return and(
          inMailbox,
          eq(emails.folder, 'inbox'),
          or(isNull(emails.snoozeUntil), lte(emails.snoozeUntil, now)),
        )
      default:
        // Literal folder match (sent, drafts, trash, spam, archive, …).
        return and(inMailbox, eq(emails.folder, folder))
    }
  }

  async listByFolder(
    userId: string,
    folder: string,
    page = 1,
    pageSize = 25,
  ): Promise<EmailListPage> {
    // Hard cap — without this a crafted `?pageSize=10000` request
    // pulls 10k email rows + their label joins into Node memory in a
    // single query. Matches the cap in /search.
    pageSize = Math.max(1, Math.min(pageSize, 100))
    page = Math.max(1, page)
    const mailboxIds = await this.resolveMailboxIds(userId)
    if (mailboxIds.length === 0) {
      return { data: [], total: 0, page, pageSize, hasMore: false }
    }

    const offset = (page - 1) * pageSize

    // SQL substring keeps the wire payload small even for emails with
    // multi-megabyte bodies. The DB does the slice; we never read the
    // full body into Node memory just to throw it away.
    const snippetExpr = sql<string>`coalesce(substring(${emails.textBody}, 1, ${
      PREVIEW_CHARS * 4
    }), '')`
    const hasAttExpr = sql<boolean>`exists(select 1 from ${attachments} where ${attachments.emailId} = ${emails.id})`

    const where = this.buildFolderWhere(folder, mailboxIds)

    const [rows, [{ count }]] = await Promise.all([
      this.db
        .select({
          id: emails.id,
          mailboxId: emails.mailboxId,
          fromAddress: emails.fromAddress,
          toAddresses: emails.toAddresses,
          cc: emails.cc,
          subject: emails.subject,
          snippetRaw: snippetExpr,
          folder: emails.folder,
          isRead: emails.isRead,
          isStarred: emails.isStarred,
          isDraft: emails.isDraft,
          hasAttachments: hasAttExpr,
          sizeBytes: emails.sizeBytes,
          status: emails.status,
          sendError: emails.sendError,
          threadId: emails.threadId,
          updatedAt: emails.updatedAt,
          createdAt: emails.createdAt,
        })
        .from(emails)
        .where(where)
        .orderBy(desc(emails.createdAt))
        .limit(pageSize)
        .offset(offset),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(emails)
        .where(where),
    ])

    const labelMap = await this.hydrateLabels(rows.map((r) => r.id))
    const data: EmailListItem[] = rows.map((r) => ({
      id: r.id,
      mailboxId: r.mailboxId,
      fromAddress: r.fromAddress,
      toAddresses: r.toAddresses,
      cc: r.cc,
      subject: r.subject,
      snippet: buildSnippet(r.snippetRaw),
      folder: r.folder,
      isRead: r.isRead,
      isStarred: r.isStarred,
      isDraft: r.isDraft,
      hasAttachments: r.hasAttachments,
      sizeBytes: r.sizeBytes,
      status: (r.status ?? 'idle') as EmailListItem['status'],
      sendError: r.sendError,
      updatedAt: r.updatedAt.toISOString(),
      createdAt: r.createdAt.toISOString(),
      labels: labelMap.get(r.id) ?? [],
      threadId: r.threadId,
    }))

    const total = Number(count ?? 0)
    return {
      data,
      total,
      page,
      pageSize,
      hasMore: offset + data.length < total,
    }
  }

  async getById(emailId: string, userId: string) {
    const result = await this.db
      .select()
      .from(emails)
      .innerJoin(mailboxes, eq(emails.mailboxId, mailboxes.id))
      .where(and(eq(emails.id, emailId), eq(mailboxes.userId, userId)))
      .limit(1)

    if (result.length === 0) return null

    const email = result[0].emails
    const emailAttachments = await this.db
      .select({
        id: attachments.id,
        emailId: attachments.emailId,
        filename: attachments.filename,
        contentType: attachments.contentType,
        contentId: attachments.contentId,
        sizeBytes: attachments.sizeBytes,
        storageKey: attachments.storageKey,
        rsvpResponse: attachments.rsvpResponse,
        rsvpRespondedAt: attachments.rsvpRespondedAt,
      })
      .from(attachments)
      .where(eq(attachments.emailId, emailId))

    // For each text/calendar attachment, parse the ICS so the client
    // can render a proper "meeting invite" card (title/time/location +
    // RSVP buttons). We do this on read rather than at receive-time so
    // we don't need a schema migration, and it's cheap — real invites
    // are a few KB and parsing runs in <1 ms.
    const enriched = await Promise.all(
      emailAttachments.map(async (a) => {
        const isIcs =
          a.contentType?.toLowerCase().includes('text/calendar') ||
          a.filename?.toLowerCase().endsWith('.ics')
        if (!isIcs) return a
        try {
          const bytes = await readFile(pathForAttachment(a.id), 'utf8')
          // Worker-thread parse — ical.js runs off the main loop
          // so a hostile invite with a catastrophic-backtracking
          // regex can't stall serving the rest of the API.
          const parsed = await parseIcsSafely(bytes)
          if (parsed) return { ...a, parsedIcs: parsed }
        } catch (err) {
          // Storage miss or parse explosion — the chip falls back to
          // the generic "Calendar invite" placeholder, which is still
          // useful. Don't poison the whole email detail response.
          console.warn(`[email] ICS parse failed for ${a.id}:`, err)
        }
        return a
      }),
    )

    return { ...email, attachments: enriched }
  }

  /// Build the slim list-row shape from a freshly inserted email — used by
  /// the realtime publish path so subscribers don't have to re-fetch just
  /// to render the inbox row.
  async toListItem(emailId: string): Promise<EmailListItem | null> {
    const rows = await this.db
      .select({
        id: emails.id,
        mailboxId: emails.mailboxId,
        fromAddress: emails.fromAddress,
        toAddresses: emails.toAddresses,
        cc: emails.cc,
        subject: emails.subject,
        textBody: emails.textBody,
        folder: emails.folder,
        isRead: emails.isRead,
        isStarred: emails.isStarred,
        isDraft: emails.isDraft,
        sizeBytes: emails.sizeBytes,
        status: emails.status,
        sendError: emails.sendError,
        threadId: emails.threadId,
        updatedAt: emails.updatedAt,
        createdAt: emails.createdAt,
      })
      .from(emails)
      .where(eq(emails.id, emailId))
      .limit(1)

    if (rows.length === 0) return null
    const r = rows[0]
    const [att, labelMap] = await Promise.all([
      this.db
        .select({ id: attachments.id })
        .from(attachments)
        .where(eq(attachments.emailId, emailId))
        .limit(1),
      this.hydrateLabels([emailId]),
    ])

    return {
      id: r.id,
      mailboxId: r.mailboxId,
      fromAddress: r.fromAddress,
      toAddresses: r.toAddresses,
      cc: r.cc,
      subject: r.subject,
      snippet: buildSnippet(r.textBody),
      folder: r.folder,
      isRead: r.isRead,
      isStarred: r.isStarred,
      isDraft: r.isDraft,
      hasAttachments: att.length > 0,
      sizeBytes: r.sizeBytes,
      status: (r.status ?? 'idle') as EmailListItem['status'],
      sendError: r.sendError,
      updatedAt: r.updatedAt.toISOString(),
      createdAt: r.createdAt.toISOString(),
      labels: labelMap.get(emailId) ?? [],
      threadId: r.threadId,
    }
  }

  async markRead(emailId: string, userId: string) {
    const result = await this.db
      .select({ id: emails.id })
      .from(emails)
      .innerJoin(mailboxes, eq(emails.mailboxId, mailboxes.id))
      .where(and(eq(emails.id, emailId), eq(mailboxes.userId, userId)))
      .limit(1)

    if (result.length === 0) return false

    await this.db.update(emails).set({ isRead: true, updatedAt: new Date() }).where(eq(emails.id, emailId))
    return true
  }

  async markUnread(emailId: string, userId: string) {
    const result = await this.db
      .select({ id: emails.id })
      .from(emails)
      .innerJoin(mailboxes, eq(emails.mailboxId, mailboxes.id))
      .where(and(eq(emails.id, emailId), eq(mailboxes.userId, userId)))
      .limit(1)

    if (result.length === 0) return false

    await this.db.update(emails).set({ isRead: false, updatedAt: new Date() }).where(eq(emails.id, emailId))
    return true
  }

  async toggleStar(emailId: string, userId: string) {
    const result = await this.db
      .select({ id: emails.id, isStarred: emails.isStarred })
      .from(emails)
      .innerJoin(mailboxes, eq(emails.mailboxId, mailboxes.id))
      .where(and(eq(emails.id, emailId), eq(mailboxes.userId, userId)))
      .limit(1)

    if (result.length === 0) return null

    const newStarred = !result[0].isStarred
    await this.db.update(emails).set({ isStarred: newStarred, updatedAt: new Date() }).where(eq(emails.id, emailId))
    return newStarred
  }

  async moveToFolder(emailId: string, userId: string, folder: string) {
    const result = await this.db
      .select({ id: emails.id })
      .from(emails)
      .innerJoin(mailboxes, eq(emails.mailboxId, mailboxes.id))
      .where(and(eq(emails.id, emailId), eq(mailboxes.userId, userId)))
      .limit(1)

    if (result.length === 0) return false

    await this.db.update(emails).set({ folder, updatedAt: new Date() }).where(eq(emails.id, emailId))
    return true
  }

  async delete(emailId: string, userId: string) {
    return this.moveToFolder(emailId, userId, 'trash')
  }

  async archive(emailId: string, userId: string) {
    return this.moveToFolder(emailId, userId, 'archive')
  }

  /// SQL fallback search — subject + from only (uses indexed columns,
  /// no body scan). Production search should go through SearchService /
  /// MeiliSearch; this stays as the cheap fallback for cold deployments.
  async search(
    userId: string,
    query: string,
    page = 1,
    pageSize = 25,
  ): Promise<EmailListPage> {
    const mailboxIds = await this.resolveMailboxIds(userId)
    if (mailboxIds.length === 0) {
      return { data: [], total: 0, page, pageSize, hasMore: false }
    }

    const pattern = `%${query.replace(/[%_]/g, (c) => `\\${c}`)}%`
    const offset = (page - 1) * pageSize
    const where = and(
      inArray(emails.mailboxId, mailboxIds),
      or(ilike(emails.subject, pattern), ilike(emails.fromAddress, pattern)),
    )

    const snippetExpr = sql<string>`coalesce(substring(${emails.textBody}, 1, ${PREVIEW_CHARS * 4}), '')`
    const hasAttExpr = sql<boolean>`exists(select 1 from ${attachments} where ${attachments.emailId} = ${emails.id})`

    const rows = await this.db
      .select({
        id: emails.id,
        mailboxId: emails.mailboxId,
        fromAddress: emails.fromAddress,
        toAddresses: emails.toAddresses,
        cc: emails.cc,
        subject: emails.subject,
        snippetRaw: snippetExpr,
        folder: emails.folder,
        isRead: emails.isRead,
        isStarred: emails.isStarred,
        isDraft: emails.isDraft,
        hasAttachments: hasAttExpr,
        sizeBytes: emails.sizeBytes,
        status: emails.status,
        sendError: emails.sendError,
        threadId: emails.threadId,
        updatedAt: emails.updatedAt,
        createdAt: emails.createdAt,
      })
      .from(emails)
      .where(where)
      .orderBy(desc(emails.createdAt))
      .limit(pageSize)
      .offset(offset)

    const labelMap = await this.hydrateLabels(rows.map((r) => r.id))
    const data: EmailListItem[] = rows.map((r) => ({
      id: r.id,
      mailboxId: r.mailboxId,
      fromAddress: r.fromAddress,
      toAddresses: r.toAddresses,
      cc: r.cc,
      subject: r.subject,
      snippet: buildSnippet(r.snippetRaw),
      folder: r.folder,
      isRead: r.isRead,
      isStarred: r.isStarred,
      isDraft: r.isDraft,
      hasAttachments: r.hasAttachments,
      sizeBytes: r.sizeBytes,
      status: (r.status ?? 'idle') as EmailListItem['status'],
      sendError: r.sendError,
      updatedAt: r.updatedAt.toISOString(),
      createdAt: r.createdAt.toISOString(),
      labels: labelMap.get(r.id) ?? [],
      threadId: r.threadId,
    }))

    return {
      data,
      total: data.length,
      page,
      pageSize,
      hasMore: data.length === pageSize,
    }
  }

  async getUnreadCounts(userId: string) {
    const mailboxIds = await this.resolveMailboxIds(userId)
    if (mailboxIds.length === 0) {
      return { inbox: 0, drafts: 0, spam: 0, total: 0 }
    }

    const counts = await this.db
      .select({
        folder: emails.folder,
        count: sql<number>`count(*)::int`,
      })
      .from(emails)
      .where(
        and(inArray(emails.mailboxId, mailboxIds), eq(emails.isRead, false)),
      )
      .groupBy(emails.folder)

    const result: Record<string, number> = { inbox: 0, drafts: 0, spam: 0, total: 0 }
    for (const c of counts) {
      const n = Number(c.count)
      result[c.folder] = n
      result.total += n
    }

    return result
  }

  async createDraft(_userId: string, data: {
    fromAddress: string
    toAddresses: string[]
    cc?: string[]
    bcc?: string[]
    subject: string
    textBody?: string
    htmlBody?: string
    mailboxId: string
    /// Message-id of the email being replied to (if any). Used to
    /// thread the draft with its parent.
    inReplyTo?: string
    /// ISO-8601 string — persisted in `emails.scheduledAt`. When set,
    /// the send dispatcher waits until the timestamp elapses before
    /// claiming + dispatching the row. The synthetic "scheduled"
    /// folder filter surfaces these rows to the user.
    scheduledAt?: string
  }) {
    const emailId = generateId('eml')
    const messageId = `${emailId}@wistmail.local`
    const scheduledAt = data.scheduledAt ? new Date(data.scheduledAt) : null
    const createdAt = new Date()

    // Thread resolution: a reply (has inReplyTo) stitches into the
    // parent's thread; a brand-new compose starts its own. Either
    // way the draft carries thread_id from insert time so the sent
    // mail appears in the conversation view even before it's
    // dispatched.
    const threadSvc = new ThreadService(this.db)
    const threadId = await threadSvc.assignThread({
      mailboxId: data.mailboxId,
      subject: data.subject,
      fromAddress: data.fromAddress,
      toAddresses: data.toAddresses,
      cc: data.cc || [],
      inReplyTo: data.inReplyTo ?? null,
      references: [],
      createdAt,
    })

    await this.db.insert(emails).values({
      id: emailId,
      messageId,
      fromAddress: data.fromAddress,
      toAddresses: data.toAddresses,
      cc: data.cc || [],
      bcc: data.bcc || [],
      subject: data.subject,
      textBody: data.textBody || null,
      htmlBody: data.htmlBody || null,
      mailboxId: data.mailboxId,
      folder: 'drafts',
      isDraft: true,
      isRead: true,
      inReplyTo: data.inReplyTo,
      headers: {},
      references: [],
      scheduledAt,
      threadId,
      createdAt,
    })

    return { id: emailId, messageId, scheduledAt, threadId }
  }
}
