/**
 * Plan + plan-feature catalog.
 *
 * Plans are NOT hardcoded — they live in this table and are fetched via
 * `/api/v1/billing/plans`. This lets us add Pro/Enterprise tiers, change
 * pricing, or introduce new feature flags without a code release.
 *
 * Today we ship one row: the "Team" plan at $3/user/month. Storage,
 * outbound caps, allowed apps, and more are all driven from
 * `plan_features` so feature-gating logic on the API + UI side reads from
 * the same source.
 *
 * Money is stored in **integer cents (USD)** — never floats. Display layers
 * format with two decimals; ledger code does pure integer math.
 */
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core'

export const plans = pgTable(
  'plans',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    /** Stable machine code, e.g. "team", "team_pro", "enterprise". */
    code: varchar('code', { length: 64 }).notNull(),
    name: varchar('name', { length: 128 }).notNull(),
    description: text('description'),
    /** Per-seat price in USD cents. 300 = $3.00. */
    perSeatCents: integer('per_seat_cents').notNull(),
    /** Storage included per seat, in megabytes. 1024 = 1 GB. */
    includedStorageMbPerSeat: integer('included_storage_mb_per_seat')
      .notNull()
      .default(1024),
    /** Trial length in days, applied once per workspace on first subscription. */
    trialDays: integer('trial_days').notNull().default(7),
    /** Days of grace after a missed renewal before outbound is suspended. */
    gracePeriodDays: integer('grace_period_days').notNull().default(7),
    /** Currency. We only store/charge USD today; provider settles locally. */
    currency: varchar('currency', { length: 8 }).notNull().default('USD'),
    /** When false, the plan is hidden from the picker — useful for legacy plans. */
    active: boolean('active').notNull().default(true),
    /** Sort order in pickers (low → high = top → bottom). */
    sortOrder: integer('sort_order').notNull().default(100),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex('plans_code_uidx').on(table.code)],
)

/**
 * Plan features. Each row is one boolean / numeric / json-shaped capability.
 * Read by the feature-gate helper in `apps/api/src/services/feature-gate.ts`.
 *
 * Examples:
 *   plan=team key="apps.mail"          value=true
 *   plan=team key="apps.chat"          value=true
 *   plan=team key="apps.calendar"      value=true
 *   plan=team key="apps.projects"      value=true
 *   plan=team key="apps.docs"          value=true
 *   plan=team key="apps.meetings"      value=true
 *   plan=team key="storage.tier_mb"    value=102400      (100 GB tier)
 *   plan=team key="outbound.daily"     value=null        (unlimited)
 *   plan=team key="api.rate_per_min"   value=600
 *   plan=team key="seats.max"          value=null        (unlimited)
 */
export const planFeatures = pgTable(
  'plan_features',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    planId: varchar('plan_id', { length: 64 })
      .notNull()
      .references(() => plans.id, { onDelete: 'cascade' }),
    /** Dotted feature key. Stable contract — UI gates read these directly. */
    key: varchar('key', { length: 128 }).notNull(),
    /**
     * The value. We accept boolean | number | string | null | json so the
     * same table can express on/off flags, numeric quotas, and structured
     * data (e.g. allowed regions).
     */
    value: jsonb('value').$type<
      boolean | number | string | null | Record<string, unknown> | unknown[]
    >(),
    /** Human-readable label for the admin UI. */
    label: varchar('label', { length: 255 }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('plan_features_plan_key_uidx').on(table.planId, table.key),
    index('plan_features_plan_idx').on(table.planId),
  ],
)
