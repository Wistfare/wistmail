import { and, eq, gt, sql } from 'drizzle-orm'
import { orgCredits, creditTransactions } from '@wistmail/db'
import { generateId } from '@wistmail/shared'
import type { Database } from '@wistmail/db'

const FREE_SIGNUP_CREDITS = 100

/**
 * BillingService manages per-org email credits.
 * Each org starts with 100 free credits. Sending an email costs 1 credit.
 * Orgs must purchase more credits to continue sending.
 */
export class BillingService {
  constructor(private db: Database) {}

  /**
   * Initialize credits for a new organization (called during setup).
   */
  async initializeCredits(orgId: string): Promise<void> {
    const existing = await this.db
      .select()
      .from(orgCredits)
      .where(eq(orgCredits.orgId, orgId))
      .limit(1)

    if (existing.length > 0) return // Already initialized

    await this.db.insert(orgCredits).values({
      id: generateId('crd'),
      orgId,
      balance: FREE_SIGNUP_CREDITS,
      totalPurchased: 0,
      totalUsed: 0,
    })

    await this.db.insert(creditTransactions).values({
      id: generateId('txn'),
      orgId,
      amount: FREE_SIGNUP_CREDITS,
      type: 'signup_bonus',
      description: 'Free signup credits',
    })
  }

  /**
   * Check if an org has enough credits to send an email.
   */
  async hasCredits(orgId: string): Promise<boolean> {
    const credits = await this.db
      .select()
      .from(orgCredits)
      .where(eq(orgCredits.orgId, orgId))
      .limit(1)

    if (credits.length === 0) return false
    return credits[0].balance > 0
  }

  /**
   * Get an org's current credit balance.
   */
  async getBalance(orgId: string): Promise<number> {
    const credits = await this.db
      .select()
      .from(orgCredits)
      .where(eq(orgCredits.orgId, orgId))
      .limit(1)

    return credits.length > 0 ? credits[0].balance : 0
  }

  /**
   * Atomically deduct 1 credit. Uses a single UPDATE … WHERE balance > 0
   * RETURNING so concurrent senders can't both see balance = 1 and each
   * decrement it (would otherwise race to balance = 0 / -1).
   *
   * Returns true if a credit was deducted, false if insufficient.
   */
  async deductCredit(orgId: string, emailId: string): Promise<boolean> {
    const updated = await this.db
      .update(orgCredits)
      .set({
        balance: sql`${orgCredits.balance} - 1`,
        totalUsed: sql`${orgCredits.totalUsed} + 1`,
        updatedAt: new Date(),
      })
      .where(and(eq(orgCredits.orgId, orgId), gt(orgCredits.balance, 0)))
      .returning({ balance: orgCredits.balance })

    if (updated.length === 0) return false

    await this.db.insert(creditTransactions).values({
      id: generateId('txn'),
      orgId,
      amount: -1,
      type: 'email_sent',
      emailId,
    })

    return true
  }

  /**
   * Add credits to an org (after purchase). Atomic — relies on the
   * SQL increment rather than a read-modify-write that would race.
   */
  async addCredits(orgId: string, amount: number, description: string): Promise<void> {
    if (amount <= 0) return

    const existing = await this.db
      .select({ id: orgCredits.id })
      .from(orgCredits)
      .where(eq(orgCredits.orgId, orgId))
      .limit(1)

    if (existing.length === 0) {
      await this.initializeCredits(orgId)
    }

    await this.db
      .update(orgCredits)
      .set({
        balance: sql`${orgCredits.balance} + ${amount}`,
        totalPurchased: sql`${orgCredits.totalPurchased} + ${amount}`,
        updatedAt: new Date(),
      })
      .where(eq(orgCredits.orgId, orgId))

    await this.db.insert(creditTransactions).values({
      id: generateId('txn'),
      orgId,
      amount,
      type: 'purchase',
      description,
    })
  }
}
