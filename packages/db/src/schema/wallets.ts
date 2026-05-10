/**
 * Per-organization prepaid USD wallet.
 *
 * Balance is the only place a billing decision reads "can this org afford
 * the renewal" — the `wallet_transactions` ledger explains how it got
 * there. Money lives as integer cents; never floats.
 *
 * `frozen` is an admin lock that rejects both debits and credits while
 * set. Distinct from `subscriptions.status='suspended'` (which is the
 * automatic, plan-driven outcome of a missed renewal).
 */
import {
  bigint,
  boolean,
  pgTable,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core'
import { organizations } from './organizations'

export const wallets = pgTable(
  'wallets',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    orgId: varchar('org_id', { length: 64 })
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    /** Current balance in USD cents. May be briefly negative during grace. */
    balanceCents: bigint('balance_cents', { mode: 'number' })
      .notNull()
      .default(0),
    currency: varchar('currency', { length: 8 }).notNull().default('USD'),
    /** Admin lock — when true, rejects every debit AND credit. */
    frozen: boolean('frozen').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex('wallets_org_uidx').on(table.orgId)],
)
