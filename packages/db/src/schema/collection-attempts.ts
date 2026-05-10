/**
 * One row per call to the Wistfare Collections API. Webhook events update
 * the row in place. Successful terminal rows ALSO produce a
 * wallet_transactions credit (linked via provider='wistfare_collections'
 * + providerRef=providerCollectionId).
 *
 * Status mirrors the provider lifecycle:
 *   pending     request accepted, awaiting user confirmation (USSD push)
 *   processing  user authorised, provider moving funds
 *   succeeded   funds collected, wallet credited
 *   failed      provider terminal failure
 *   expired     user did not confirm in time
 *
 * Idempotency: idempotencyKey is unique always (we send it on every
 * request); providerCollectionId is unique once the provider has
 * acknowledged. Both are partial unique indexes so NULLs don't collide.
 */
import { sql } from 'drizzle-orm'
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
import { organizations } from './organizations'
import { users } from './users'

export const collectionAttempts = pgTable(
  'collection_attempts',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    orgId: varchar('org_id', { length: 64 })
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    initiatedBy: varchar('initiated_by', { length: 64 })
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    /** Idempotency key we sent to Wistfare. Unique per attempt. */
    idempotencyKey: varchar('idempotency_key', { length: 128 }).notNull(),
    /** Provider's collection id once accepted. NULL until response received. */
    providerCollectionId: varchar('provider_collection_id', { length: 128 }),
    /** mtn_momo | airtel_momo (card later). */
    method: varchar('method', { length: 24 }).notNull(),
    msisdn: varchar('msisdn', { length: 32 }).notNull(),
    /** Amount in USD cents requested. */
    amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
    /** Local-currency display amount (e.g. RWF) shown to user. For audit. */
    displayAmount: bigint('display_amount', { mode: 'number' }),
    displayCurrency: varchar('display_currency', { length: 8 }),
    /** pending | processing | succeeded | failed | expired */
    status: varchar('status', { length: 24 }).notNull().default('pending'),
    failureReason: text('failure_reason'),
    /** Raw provider request payload — for debugging. */
    requestPayload: jsonb('request_payload').$type<Record<string, unknown>>(),
    /** Last webhook payload we got — for debugging. */
    lastWebhookPayload: jsonb('last_webhook_payload').$type<
      Record<string, unknown>
    >(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('collection_attempts_idem_uidx').on(table.idempotencyKey),
    uniqueIndex('collection_attempts_provider_uidx')
      .on(table.providerCollectionId)
      .where(sql`provider_collection_id IS NOT NULL`),
    index('collection_attempts_org_idx').on(table.orgId, table.createdAt),
    index('collection_attempts_status_idx').on(table.status),
  ],
)
