import { eq, and, desc, gt, ilike, isNull, lte, or, sql, inArray } from 'drizzle-orm'
import { emails, attachments, mailboxes } from '@wistmail/db'
import { generateId } from '@wistmail/shared'
import type { Database } from '@wistmail/db'

const PREVIEW_CHARS = 200

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
      .select()
      .from(attachments)
      .where(eq(attachments.emailId, emailId))

    return { ...email, attachments: emailAttachments }
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
        updatedAt: emails.updatedAt,
        createdAt: emails.createdAt,
      })
      .from(emails)
      .where(eq(emails.id, emailId))
      .limit(1)

    if (rows.length === 0) return null
    const r = rows[0]
    const att = await this.db
      .select({ id: attachments.id })
      .from(attachments)
      .where(eq(attachments.emailId, emailId))
      .limit(1)

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
        updatedAt: emails.updatedAt,
        createdAt: emails.createdAt,
      })
      .from(emails)
      .where(where)
      .orderBy(desc(emails.createdAt))
      .limit(pageSize)
      .offset(offset)

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
  }) {
    const emailId = generateId('eml')
    const messageId = `${emailId}@wistmail.local`

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
      headers: {},
      references: [],
    })

    return { id: emailId, messageId }
  }
}
