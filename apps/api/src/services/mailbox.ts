import { eq, and } from 'drizzle-orm'
import { mailboxes, domains } from '@wistmail/db'
import { generateId, ValidationError, NotFoundError, ConflictError } from '@wistmail/shared'
import type { Database } from '@wistmail/db'

export class MailboxService {
  constructor(private db: Database) {}

  async create(userId: string, input: { address: string; displayName: string; domainId: string }) {
    const localPart = input.address.split('@')[0]?.trim().toLowerCase()

    // Verify domain belongs to user
    const domain = await this.db
      .select()
      .from(domains)
      .where(and(eq(domains.id, input.domainId), eq(domains.userId, userId)))
      .limit(1)

    if (domain.length === 0) {
      throw new NotFoundError('Domain', input.domainId)
    }

    const fullAddress = `${localPart}@${domain[0].name}`

    // Check if mailbox already exists
    const existing = await this.db
      .select()
      .from(mailboxes)
      .where(eq(mailboxes.address, fullAddress))
      .limit(1)

    if (existing.length > 0) {
      throw new ConflictError('A mailbox with this address already exists')
    }

    if (!localPart || localPart.length < 1) {
      throw new ValidationError('Invalid email address')
    }

    const mailboxId = generateId('mbx')
    const now = new Date()

    await this.db.insert(mailboxes).values({
      id: mailboxId,
      address: fullAddress,
      displayName: input.displayName.trim(),
      domainId: input.domainId,
      userId,
      createdAt: now,
      updatedAt: now,
    })

    return {
      id: mailboxId,
      address: fullAddress,
      displayName: input.displayName.trim(),
      domainId: input.domainId,
    }
  }

  async list(userId: string) {
    return this.db.select().from(mailboxes).where(eq(mailboxes.userId, userId))
  }

  async delete(mailboxId: string, userId: string) {
    const result = await this.db
      .select()
      .from(mailboxes)
      .where(and(eq(mailboxes.id, mailboxId), eq(mailboxes.userId, userId)))
      .limit(1)

    if (result.length === 0) {
      throw new NotFoundError('Mailbox', mailboxId)
    }

    await this.db.delete(mailboxes).where(eq(mailboxes.id, mailboxId))
  }
}
