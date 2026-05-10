/**
 * Org → Plan subscription with a status state machine.
 *
 *   trial → active → grace → suspended → cancelled
 *               ↑__________|
 *
 *   trial:      free, no charge, ends at trial_ends_at
 *   active:     paid, current_period_end in the future
 *   grace:      current_period_end passed, within plan.grace_period_days,
 *               outbound still works
 *   suspended:  outbound blocked; revives on a successful topup → renewal
 *   cancelled:  terminal. New subscription row needed to reactivate.
 *
 * One non-cancelled subscription per org (partial unique index). Cancelled
 * rows stay around for history.
 */
import { sql } from 'drizzle-orm'
import {
  index,
  integer,
  pgTable,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core'
import { organizations } from './organizations'
import { plans } from './plans'

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    orgId: varchar('org_id', { length: 64 })
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    planId: varchar('plan_id', { length: 64 })
      .notNull()
      .references(() => plans.id, { onDelete: 'restrict' }),
    /** trial | active | grace | suspended | cancelled */
    status: varchar('status', { length: 24 }).notNull().default('trial'),
    /** Paid seats this period. Drives renewal price = seats * plan.perSeatCents. */
    seats: integer('seats').notNull().default(1),
    trialStartedAt: timestamp('trial_started_at', { withTimezone: true }),
    trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),
    currentPeriodStart: timestamp('current_period_start', {
      withTimezone: true,
    }),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
    /** When grace expires and outbound gets suspended. Set when status flips to grace. */
    graceEndsAt: timestamp('grace_ends_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // At most one non-cancelled subscription per org. Cancelled rows kept for history.
    uniqueIndex('subscriptions_org_active_uidx')
      .on(table.orgId)
      .where(sql`status <> 'cancelled'`),
    index('subscriptions_status_idx').on(table.status),
    index('subscriptions_period_end_idx').on(table.currentPeriodEnd),
  ],
)
