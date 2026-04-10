import { eq } from 'drizzle-orm'
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
   * Deduct 1 credit for sending an email.
   * Returns true if successful, false if insufficient credits.
   */
  async deductCredit(orgId: string, emailId: string): Promise<boolean> {
    const credits = await this.db
      .select()
      .from(orgCredits)
      .where(eq(orgCredits.orgId, orgId))
      .limit(1)

    if (credits.length === 0 || credits[0].balance <= 0) {
      return false
    }

    await this.db
      .update(orgCredits)
      .set({
        balance: credits[0].balance - 1,
        totalUsed: credits[0].totalUsed + 1,
        updatedAt: new Date(),
      })
      .where(eq(orgCredits.orgId, orgId))

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
   * Add credits to an org (after purchase).
   */
  async addCredits(orgId: string, amount: number, description: string): Promise<void> {
    const credits = await this.db
      .select()
      .from(orgCredits)
      .where(eq(orgCredits.orgId, orgId))
      .limit(1)

    if (credits.length === 0) {
      await this.initializeCredits(orgId)
    }

    await this.db
      .update(orgCredits)
      .set({
        balance: (credits[0]?.balance || 0) + amount,
        totalPurchased: (credits[0]?.totalPurchased || 0) + amount,
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
