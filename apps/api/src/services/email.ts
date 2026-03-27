import { eq, and, desc, sql, like, or } from 'drizzle-orm'
import { emails, attachments, mailboxes } from '@wistmail/db'
import { generateId } from '@wistmail/shared'
import type { Database } from '@wistmail/db'

export class EmailService {
  constructor(private db: Database) {}

  async listByFolder(userId: string, folder: string, page = 1, pageSize = 25) {
    // Get user's mailbox IDs
    const userMailboxes = await this.db
      .select({ id: mailboxes.id })
      .from(mailboxes)
      .where(eq(mailboxes.userId, userId))

    if (userMailboxes.length === 0) {
      return { data: [], total: 0, page, pageSize, hasMore: false }
    }

    const mailboxIds = userMailboxes.map((m) => m.id)

    const offset = (page - 1) * pageSize

    const emailList = await this.db
      .select()
      .from(emails)
      .where(
        and(
          sql`${emails.mailboxId} IN ${mailboxIds}`,
          eq(emails.folder, folder),
        ),
      )
      .orderBy(desc(emails.createdAt))
      .limit(pageSize)
      .offset(offset)

    const countResult = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(emails)
      .where(
        and(
          sql`${emails.mailboxId} IN ${mailboxIds}`,
          eq(emails.folder, folder),
        ),
      )

    const total = Number(countResult[0]?.count || 0)

    return {
      data: emailList,
      total,
      page,
      pageSize,
      hasMore: offset + pageSize < total,
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

  async markRead(emailId: string, userId: string) {
    const result = await this.db
      .select({ id: emails.id })
      .from(emails)
      .innerJoin(mailboxes, eq(emails.mailboxId, mailboxes.id))
      .where(and(eq(emails.id, emailId), eq(mailboxes.userId, userId)))
      .limit(1)

    if (result.length === 0) return false

    await this.db.update(emails).set({ isRead: true }).where(eq(emails.id, emailId))
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

    await this.db.update(emails).set({ isRead: false }).where(eq(emails.id, emailId))
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
    await this.db.update(emails).set({ isStarred: newStarred }).where(eq(emails.id, emailId))
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

    await this.db.update(emails).set({ folder }).where(eq(emails.id, emailId))
    return true
  }

  async delete(emailId: string, userId: string) {
    return this.moveToFolder(emailId, userId, 'trash')
  }

  async archive(emailId: string, userId: string) {
    return this.moveToFolder(emailId, userId, 'archive')
  }

  async search(userId: string, query: string, page = 1, pageSize = 25) {
    const userMailboxes = await this.db
      .select({ id: mailboxes.id })
      .from(mailboxes)
      .where(eq(mailboxes.userId, userId))

    if (userMailboxes.length === 0) {
      return { data: [], total: 0, page, pageSize, hasMore: false }
    }

    const mailboxIds = userMailboxes.map((m) => m.id)
    const searchPattern = `%${query}%`
    const offset = (page - 1) * pageSize

    const results = await this.db
      .select()
      .from(emails)
      .where(
        and(
          sql`${emails.mailboxId} IN ${mailboxIds}`,
          or(
            like(emails.subject, searchPattern),
            like(emails.fromAddress, searchPattern),
            like(emails.textBody, searchPattern),
          ),
        ),
      )
      .orderBy(desc(emails.createdAt))
      .limit(pageSize)
      .offset(offset)

    return { data: results, total: results.length, page, pageSize, hasMore: false }
  }

  async getUnreadCounts(userId: string) {
    const userMailboxes = await this.db
      .select({ id: mailboxes.id })
      .from(mailboxes)
      .where(eq(mailboxes.userId, userId))

    if (userMailboxes.length === 0) {
      return { inbox: 0, drafts: 0, spam: 0, total: 0 }
    }

    const mailboxIds = userMailboxes.map((m) => m.id)

    const counts = await this.db
      .select({
        folder: emails.folder,
        count: sql<number>`count(*)`,
      })
      .from(emails)
      .where(
        and(
          sql`${emails.mailboxId} IN ${mailboxIds}`,
          eq(emails.isRead, false),
        ),
      )
      .groupBy(emails.folder)

    const result: Record<string, number> = { inbox: 0, drafts: 0, spam: 0, total: 0 }
    for (const c of counts) {
      result[c.folder] = Number(c.count)
      result.total += Number(c.count)
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
