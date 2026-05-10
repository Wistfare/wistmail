# Phase C — Billing & RBAC Schema (rest-of) Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Land the wallet, subscription, ledger, and provider-attempt tables; seed default roles/permissions/plan; ship schema + seed-idempotency tests. Phase C ends when an empty DB can boot, get seeded, and answer "what plan is this org on / what's their balance / who paid what" through the schema alone.

**Architecture:** Drizzle Postgres schema in `packages/db/src/schema/`. Each table mirrored idempotently into `apps/api/src/index.ts → ensureSchema()` per project policy (`packages/db/MIGRATIONS.md`). Single migration file `0009_billing_wallet_and_subscriptions.sql` covers all four new tables. Seed lives in a NEW `packages/db/src/seed.ts` (idempotent, ON CONFLICT DO NOTHING). Wired into `ensureSchema()` so dev installs are immediately usable.

**Tech Stack:** Drizzle ORM, PostgreSQL (timestamptz, varchar(64) IDs, integer cents for money), Vitest, PGlite for tests.

**Conventions inherited from existing schema:**
- IDs: `varchar(64)` with prefixes (`pln_`, `sub_`, `wlt_`, `txn_`, `col_`, `rol_`, `perm_`)
- Money: integer cents
- Time: `timestamptz NOT NULL DEFAULT now()`
- Audit: `created_at` + `updated_at`
- Soft-delete: `deleted_at timestamptz` (only where soft-delete makes sense)

---

## Pre-flight (do once, before Task 1)

Run, expected output:
```
cd packages/db
pnpm typecheck    # exit 0 — drizzle/singlestore noise is acceptable, see skill pitfalls
pnpm --filter @wistmail/api test    # 314+ passing baseline
```
Note the baseline test count for later regression check.

---

## Task 1: Add wallets table (per-org prepaid USD balance)

**Objective:** One row per organization holding the current USD-cents balance. Single source of truth for "can this org afford a renewal".

**Files:**
- Create: `packages/db/src/schema/wallets.ts`
- Modify: `packages/db/src/schema/index.ts` (add export)

**Schema (wallets.ts):**
```ts
import { bigint, index, integer, pgTable, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core'
import { organizations } from './organizations'

/**
 * Per-organization prepaid USD wallet. Balance is stored in integer cents.
 * The wallet is the only place a balance is read for billing decisions —
 * the transactions ledger explains how it got there.
 *
 * Suspended wallets cannot fund renewals; outbound is blocked at the API edge.
 */
export const wallets = pgTable(
  'wallets',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    orgId: varchar('org_id', { length: 64 })
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    /** Current balance in USD cents. May go negative briefly during grace period. */
    balanceCents: bigint('balance_cents', { mode: 'number' }).notNull().default(0),
    currency: varchar('currency', { length: 8 }).notNull().default('USD'),
    /** Frozen wallets reject debits and topups (admin lock). */
    frozen: integer('frozen').notNull().default(0), // 0/1, kept int for portability
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('wallets_org_uidx').on(table.orgId)],
)
```

**Step 1: Write file** (above content).
**Step 2: Add export** in `index.ts`: `export { wallets } from './wallets'`
**Step 3: Verify** `cd packages/db && pnpm typecheck` exit 0.
**Step 4: Commit:** `git add packages/db/src/schema/wallets.ts packages/db/src/schema/index.ts && git commit -m "feat(db): wallets table — per-org prepaid USD balance"`

---

## Task 2: Add subscriptions table

**Objective:** Track which plan an org is on, current period boundaries, trial window, and billing status.

**Files:**
- Create: `packages/db/src/schema/subscriptions.ts`
- Modify: `packages/db/src/schema/index.ts`

**Schema:**
```ts
import { index, integer, pgTable, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core'
import { organizations } from './organizations'
import { plans } from './plans'

/**
 * One subscription per organization at a time. Status state machine:
 *   trial → active → grace → suspended → cancelled
 *                ↑__________|
 *
 *   trial:      free, no charge, ends at trial_ends_at
 *   active:     paid, currentPeriodEnd in future
 *   grace:      currentPeriodEnd passed, within plan.gracePeriodDays
 *   suspended:  outbound blocked, can be revived by topup
 *   cancelled:  terminal, requires new subscription row
 */
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
    status: varchar('status', { length: 24 }).notNull().default('trial'),
    /** Number of paid seats this period — drives renewal price. */
    seats: integer('seats').notNull().default(1),
    trialStartedAt: timestamp('trial_started_at', { withTimezone: true }),
    trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),
    currentPeriodStart: timestamp('current_period_start', { withTimezone: true }),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
    /** When grace expires and we suspend outbound. Set when status flips to grace. */
    graceEndsAt: timestamp('grace_ends_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Only one non-cancelled subscription per org. Cancelled rows kept for history.
    uniqueIndex('subscriptions_org_active_uidx')
      .on(table.orgId)
      .where(/* sql */ `status <> 'cancelled'`),
    index('subscriptions_status_idx').on(table.status),
    index('subscriptions_period_end_idx').on(table.currentPeriodEnd),
  ],
)
```
> Note: import `sql` from drizzle-orm if needed; mirror the existing `roles.ts` partial-index pattern exactly.

**Step 1–4: same shape as Task 1.** Commit message: `feat(db): subscriptions table — org → plan + status state machine`

---

## Task 3: Add wallet_transactions ledger

**Objective:** Append-only ledger explaining every wallet balance change. Auditable, idempotent on provider IDs.

**Files:**
- Create: `packages/db/src/schema/wallet-transactions.ts`
- Modify: `packages/db/src/schema/index.ts`

**Schema:**
```ts
import { bigint, index, jsonb, pgTable, text, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core'
import { organizations } from './organizations'
import { users } from './users'
import { wallets } from './wallets'

/**
 * Append-only ledger. Every wallet balance change has exactly one row here.
 * Reasons:
 *   topup            — user added funds (linked via referenceId to a collection_attempt)
 *   renewal_charge   — billing worker debited for a period renewal
 *   refund           — admin-issued reversal
 *   adjustment       — manual correction (admin), free-text note
 *   trial_credit     — initial trial grant (zero in money but logged for audit)
 *   chargeback       — provider reversed a topup
 *
 * Direction: amountCents is signed. Credits positive, debits negative.
 * Idempotency: (provider, providerRef) is unique when both set, so duplicate
 * webhook deliveries can't double-credit.
 */
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
    /** Signed amount in USD cents. + = credit, − = debit. */
    amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
    /** Balance AFTER this transaction — denormalized for cheap audits. */
    balanceAfterCents: bigint('balance_after_cents', { mode: 'number' }).notNull(),
    reason: varchar('reason', { length: 32 }).notNull(),
    /** Provider name when this came from an external system (wistfare_collections, manual). */
    provider: varchar('provider', { length: 32 }),
    /** Provider's transaction ID, e.g. Wistfare collection ID. NULL for manual entries. */
    providerRef: varchar('provider_ref', { length: 128 }),
    /** Optional link to a subscription for renewal_charge / chargeback rows. */
    subscriptionId: varchar('subscription_id', { length: 64 }),
    /** Free-text human note (admin adjustments). */
    note: text('note'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    /** Who initiated this (admin user for manual; NULL for automated). */
    initiatedBy: varchar('initiated_by', { length: 64 }).references(
      () => users.id,
      { onDelete: 'set null' },
    ),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('wallet_transactions_wallet_idx').on(table.walletId, table.createdAt),
    index('wallet_transactions_org_idx').on(table.orgId, table.createdAt),
    // Idempotency: same provider+ref can never insert twice.
    uniqueIndex('wallet_transactions_provider_ref_uidx')
      .on(table.provider, table.providerRef)
      .where(/* sql */ `provider IS NOT NULL AND provider_ref IS NOT NULL`),
  ],
)
```

**Step 1–4: same shape.** Commit: `feat(db): wallet_transactions ledger with idempotent provider refs`

---

## Task 4: Add collection_attempts table (Wistfare Collections lifecycle)

**Objective:** Track every call to Wistfare Collections API and reconcile webhook events. Separate from the ledger because attempts can fail without producing a wallet movement.

**Files:**
- Create: `packages/db/src/schema/collection-attempts.ts`
- Modify: `packages/db/src/schema/index.ts`

**Schema:**
```ts
import { bigint, index, jsonb, pgTable, text, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core'
import { organizations } from './organizations'
import { users } from './users'

/**
 * One row per collection attempt sent to the Wistfare Collections API.
 * Webhook events update the row in place; the *successful* terminal row
 * also produces a wallet_transactions credit (linked via providerRef).
 *
 * Status mirrors the provider lifecycle:
 *   pending     — request accepted, awaiting user confirmation (USSD push)
 *   processing  — user authorized, provider moving funds
 *   succeeded   — funds collected, wallet credited
 *   failed      — provider terminal failure
 *   expired     — user did not confirm in time
 */
export const collectionAttempts = pgTable(
  'collection_attempts',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    orgId: varchar('org_id', { length: 64 })
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    /** User who initiated the topup. */
    initiatedBy: varchar('initiated_by', { length: 64 })
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    /** Idempotency key we sent to Wistfare. */
    idempotencyKey: varchar('idempotency_key', { length: 128 }).notNull(),
    /** Provider's collection ID once accepted. NULL until we get the response. */
    providerCollectionId: varchar('provider_collection_id', { length: 128 }),
    method: varchar('method', { length: 24 }).notNull(), // mtn_momo, airtel_momo
    msisdn: varchar('msisdn', { length: 32 }).notNull(),
    /** Amount in USD cents requested. */
    amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
    /** Local-currency amount approximation shown to the user (e.g. RWF). For audit. */
    displayAmount: bigint('display_amount', { mode: 'number' }),
    displayCurrency: varchar('display_currency', { length: 8 }),
    status: varchar('status', { length: 24 }).notNull().default('pending'),
    failureReason: text('failure_reason'),
    /** Raw provider payloads — request and last webhook — for debugging. */
    requestPayload: jsonb('request_payload').$type<Record<string, unknown>>(),
    lastWebhookPayload: jsonb('last_webhook_payload').$type<Record<string, unknown>>(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('collection_attempts_idem_uidx').on(table.idempotencyKey),
    uniqueIndex('collection_attempts_provider_uidx')
      .on(table.providerCollectionId)
      .where(/* sql */ `provider_collection_id IS NOT NULL`),
    index('collection_attempts_org_idx').on(table.orgId, table.createdAt),
    index('collection_attempts_status_idx').on(table.status),
  ],
)
```

**Step 1–4: same shape.** Commit: `feat(db): collection_attempts — Wistfare Collections lifecycle`

---

## Task 5: Author migration 0009

**Objective:** Hand-authored SQL covering tasks 1–4. Hand-author per skill guidance — do NOT run drizzle-kit generate (the journal-orphan trap risk is documented and we already have a clean append pattern).

**File:** Create `packages/db/drizzle/0009_billing_wallet_and_subscriptions.sql`

Content: literal SQL for all four tables + indexes, idempotent (`IF NOT EXISTS`), `--> statement-breakpoint` between statements, partial unique indexes use `WHERE` clauses identical to the schema.

**Then update the journal:** Append entry to `packages/db/drizzle/meta/_journal.json` with `idx: 9, tag: "0009_billing_wallet_and_subscriptions"`. Generate matching snapshot via:

```sh
cd packages/db && pnpm drizzle-kit generate --name reconcile_0009 --custom
```

If that pulls in unrelated drift: STOP, hand-author the snapshot from 0008's by copying and applying just the four new tables. Document either path in the commit message.

**Verify:**
```sh
# Apply against a fresh PGlite test DB
pnpm --filter @wistmail/api test  # the migration-runner test should green
```

**Commit:** `feat(db): migration 0009 — wallet, subscriptions, transactions, collection_attempts`

---

## Task 6: Mirror in ensureSchema()

**Objective:** Append the four CREATE TABLE blocks to `apps/api/src/index.ts` `createStatements` array, after the existing `org_role_assignments_role_idx` entry (around line 511). Project policy in `MIGRATIONS.md` requires this until ensureSchema is formally deprecated.

**Verify:** Boot the API against a fresh DB without running migrate; the four tables exist.
```sh
DISABLE_ENSURE_SCHEMA= DATABASE_URL=postgres://localhost/wistmail_phc_test pnpm --filter @wistmail/api dev &
sleep 4 && psql $DATABASE_URL -c "\dt wallets|subscriptions|wallet_transactions|collection_attempts"
```

**Commit:** `feat(api): mirror 0009 billing tables in ensureSchema`

---

## Task 7: Author seed module

**Objective:** Idempotent seed for system roles + permissions + default Team plan + plan_features. NO inline DDL.

**File:** Create `packages/db/src/seed.ts`

Exports `seedSystemData(db)`:
1. Insert 5 system roles (owner/admin/manager/finance/member) with correct levels and `grants_admin_access` flags. ON CONFLICT (code) WHERE org_id IS NULL DO NOTHING.
2. Insert role_permissions per the role spec in `roles.ts` header comment:
   - owner: `["*"]`
   - admin: every permission EXCEPT `org:transfer`, `org:delete`
   - manager: `users:read`, `users:invite`, `roles:assign` (with constraint `{maxLevel: 60}`), `audit:read`
   - finance: `billing:*`, `audit:read`
   - member: NONE (member has no admin permissions; they don't see admin)
3. Insert default Team plan (`code='team'`, `per_seat_cents=300`, `included_storage_mb_per_seat=1024` (1 GB per seat — matches schema default), `trial_days=7`, `grace_period_days=7`).
4. Insert plan_features for `team`:
   - `apps.mail`=true, `apps.chat`=true, `apps.calendar`=true, `apps.projects`=true, `apps.docs`=true, `apps.meetings`=true
   - `storage.tier_mb`=null (workspace pool = sum of seat allowances; no extra cap)
   - `outbound.daily`=null (unlimited)
   - `api.rate_per_min`=600
   - `seats.max`=null
   - `mfa.totp`=true, `mfa.email`=true

Use deterministic IDs (e.g. `rol_sys_owner`, `pln_team`, `pf_team_apps_mail`) so re-runs hit the unique constraint cleanly.

**Wire-up:** Call `seedSystemData(db)` at the end of `ensureSchema()` in `apps/api/src/index.ts`, behind `if (!process.env.DISABLE_SEED)`.

**Test (Task 8 covers this).**

**Commit:** `feat(db): seedSystemData — system roles, permissions, default Team plan`

---

## Task 8: Tests

**File:** Create `packages/db/src/seed.test.ts`

Cases (Vitest + PGlite per existing fixture pattern in `apps/api/src/test-support/pg-fixture.ts`):
1. `schema-presence`: import every schema barrel, assert all new tables: `wallets`, `subscriptions`, `walletTransactions`, `collectionAttempts` are defined and have expected columns.
2. `seed-greenfield`: fresh DB → run schema → run `seedSystemData` once → expect 5 rows in `roles WHERE is_system=true`, 1 row in `plans WHERE code='team'`, 12 rows in `plan_features WHERE plan_id='pln_team'`.
3. `seed-idempotent`: run `seedSystemData` twice → row counts unchanged, no error thrown.
4. `wallet-tx-idempotency`: insert two `wallet_transactions` rows with same `(provider, providerRef)` → second insert rejected by unique constraint.
5. `subscription-uniqueness`: insert two non-cancelled subscriptions for the same org → second rejected. After cancelling the first, second insert succeeds.

**Run:** `pnpm --filter @wistmail/db test` — expect all green; total project test count goes from 314 → 314+N.

**Commit:** `test(db): schema presence + seed idempotency + billing constraints`

---

## Task 9: Phase C wrap commit

**Objective:** Phase C close-out.

```sh
pnpm typecheck                # exit 0
pnpm test                     # all green
git log --oneline feat/v3-email-templates...HEAD
```

Update `docs/plans/2026-05-10-phase-c-billing-schema.md` with a closing line: `Status: COMPLETE on <commit-sha>`.

Final commit: `chore(plans): mark Phase C complete`

---

## Done definition

Phase C is done when:
- [x] `wallets`, `subscriptions`, `wallet_transactions`, `collection_attempts` exist in schema, migration, and ensureSchema
- [x] Migration 0009 runs cleanly on greenfield AND on top of an ensureSchema'd DB
- [x] `seedSystemData()` is idempotent and runs on every API boot
- [x] All existing tests still pass; new schema/seed tests added (314 → 354)
- [x] No drizzle-kit journal contamination; no unrelated changes pulled in

**Status: COMPLETE on commit 30d7019** (May 10, 2026). Built across commits:
- `74b8d02` wallets schema
- `5732f8f` subscriptions + wallet_transactions + collection_attempts schemas
- `7b7c569` migration 0009 + journal entry
- `10d7214` ensureSchema mirror
- `30d7019` seedSystemData + 9 new tests

Next phase queued: D (Billing API + Wistfare Collections integration + webhooks).
