import { bigint, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core'
import { organizations } from './organizations'

export const orgCredits = pgTable('org_credits', {
  id: varchar('id', { length: 64 }).primaryKey(),
  orgId: varchar('org_id', { length: 64 })
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' })
    .unique(),
  /** Total email credits available */
  balance: bigint('balance', { mode: 'number' }).notNull().default(100),
  /** Total credits ever purchased */
  totalPurchased: bigint('total_purchased', { mode: 'number' }).notNull().default(0),
  /** Total credits consumed */
  totalUsed: bigint('total_used', { mode: 'number' }).notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const creditTransactions = pgTable('credit_transactions', {
  id: varchar('id', { length: 64 }).primaryKey(),
  orgId: varchar('org_id', { length: 64 })
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  /** positive = credit added, negative = credit consumed */
  amount: bigint('amount', { mode: 'number' }).notNull(),
  /** Type: 'purchase', 'signup_bonus', 'email_sent', 'refund' */
  type: varchar('type', { length: 30 }).notNull(),
  /** Optional description */
  description: text('description'),
  /** Reference to the email that consumed the credit */
  emailId: varchar('email_id', { length: 64 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
