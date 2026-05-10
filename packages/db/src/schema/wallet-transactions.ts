/**
 * Append-only wallet ledger. Every change to a wallet's balanceCents has
 * exactly one row here. The ledger is the source of truth for audits;
 * the wallets row's balance is denormalised state derived from it.
 *
 * Reasons (open set, varchar so we can add more without a migration):
 *   topup            user funded the wallet (linked to a collection_attempt)
 *   renewal_charge   billing worker debited for a period renewal
 *   refund           admin-issued reversal
 *   adjustment       manual correction (free-text note required)
 *   trial_credit     initial trial grant (zero in money but logged for audit)
 *   chargeback       provider reversed a topup
 *
 * Direction: amountCents is signed. + = credit, − = debit.
 *
 * Idempotency: (provider, providerRef) is unique when both set, so a
 * duplicate webhook delivery cannot double-credit.
 */
import {
  bigint,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { organizations } from './organizations'
import { users } from './users'
import { wallets } from './wallets'

export const walletTransactions = pgTable(
  'wallet_transactions',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    walletId: varchar('wallet_id', { length: 64 })
      .notNull()
      .references(() => wallets.id, { onDelete: 'restrict' }),
    orgId: varchar('org_id', { length: 64 })
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    /** Signed USD cents. + = credit, − = debit. */
    amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
    /** Balance AFTER this row was applied — denormalised for cheap audits. */
    balanceAfterCents: bigint('balance_after_cents', {
      mode: 'number',
    }).notNull(),
    reason: varchar('reason', { length: 32 }).notNull(),
    /** External system that produced this row, when applicable. */
    provider: varchar('provider', { length: 32 }),
    /** Provider's transaction id, e.g. Wistfare collection id. NULL for manual. */
    providerRef: varchar('provider_ref', { length: 128 }),
    /** Optional pointer to a subscription (renewal_charge, chargeback). */
    subscriptionId: varchar('subscription_id', { length: 64 }),
    /** Free-text human note (admin adjustments). */
    note: text('note'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    /** Who initiated this. NULL for automated/cron. */
    initiatedBy: varchar('initiated_by', { length: 64 }).references(
      () => users.id,
      { onDelete: 'set null' },
    ),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('wallet_transactions_wallet_idx').on(table.walletId, table.createdAt),
    index('wallet_transactions_org_idx').on(table.orgId, table.createdAt),
    // Same provider+ref can never insert twice — webhook idempotency.
    uniqueIndex('wallet_transactions_provider_ref_uidx')
      .on(table.provider, table.providerRef)
      .where(sql`provider IS NOT NULL AND provider_ref IS NOT NULL`),
  ],
)
