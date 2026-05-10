# Phase D — Billing API + Wistfare Collections + Webhooks

> Phase C (schema) is complete. This phase wires the runtime: services, routes, webhook receiver,
> and the renewal worker.

**Goal:** Ship a working billing layer end-to-end: plans/wallet/subscription endpoints, a Wistfare
Collections client, idempotent webhook handling, and a renewal-tick worker that transitions the
subscription state machine.

**Architecture:**
- All money ops go through one `BillingService` so the ledger and `wallets.balanceCents` stay in
  lock-step (single transaction per mutation).
- Wistfare integration is one outbound call (`POST /v1/collections`) plus inbound webhooks. The
  client is a thin typed wrapper — no SDK dependency.
- Webhook handler is shared-secret authed (header) and idempotent on `(provider, providerRef)`.
- Renewal/grace transitions live in `BillingService.tickRenewals()` — driven by a tick endpoint
  (`POST /api/v1/billing/internal/tick`) gated by `INBOUND_SECRET`. Cron wiring is deferred to
  Phase I (docker e2e).

**Tech stack:** Hono + Drizzle (existing). No new deps if avoidable.

---

## Conventions

- One **BillingService** with explicit transactional methods. No silent partial writes.
- Webhook idempotency: insert ledger row keyed on `(wistfare_collections, provider_collection_id)`
  — duplicate webhook is a no-op via the partial unique index.
- `INBOUND_SECRET` (already used by mail-engine) gates `/internal/*` and the webhook receiver.
  Wistfare HMAC verification is best-effort: the signed payload format isn't documented in the
  Wistfare docs we have, so today we accept any payload signed with our shared secret as a
  header (`X-Wistfare-Secret`). When real HMAC docs land we swap the verifier.
- All routes return `{ data | error }`; errors throw via existing `ValidationError` /
  `AuthenticationError` so `errorHandler` formats them.

---

## Task 1 — Wistfare client (typed wrapper)

**Files**
- Create `apps/api/src/lib/wistfare-client.ts`
- Create `apps/api/src/lib/wistfare-client.test.ts`

Exports `WistfareClient` with `initiateCollection(params)` and `listCollections(filters)`.
- Reads `WISTFARE_API_KEY`, `WISTFARE_API_URL` (default `https://api-production.wistfare.com`).
- Test-mode shortcut: when `NODE_ENV=test` or `WISTFARE_API_KEY` unset, return a stubbed
  response (no network).
- Throws `BillingProviderError` on non-2xx with parsed body.
- Tests use `fetch` mocking (vi.fn) and assert URL, headers, body shape.

Verify: `pnpm --filter @wistmail/api test wistfare-client`.

---

## Task 2 — BillingService: wallet credit/debit primitives

**Files**
- Create `apps/api/src/services/billing.ts`
- Create `apps/api/src/services/billing.test.ts`

Methods:
- `getOrCreateWallet(orgId)` — idempotent
- `creditWallet({ orgId, amountCents, reason, provider, providerRef, subscriptionId?, initiatedBy?, note?, metadata? })` — inserts ledger row + bumps `balanceCents` in one transaction. If `(provider, providerRef)` already exists, returns the existing tx (idempotent).
- `debitWallet(...)` — same shape with negative amount; refuses if balance would go below `−plan.gracePeriodDays * dailyCharge` (we keep it simple: just refuse below 0 unless `allowNegative=true`).
- `listTransactions({ orgId, limit, offset })`

Tests cover: idempotency on duplicate provider+ref (returns same row), frozen wallet rejection,
balance-after monotonic accuracy, negative-balance protection, ledger-vs-balance invariant.

---

## Task 3 — BillingService: subscription lifecycle

Methods on the same service:
- `getActiveSubscription(orgId)` — non-cancelled row.
- `startTrial(orgId, planCode, seats=1, initiatedBy)` — creates a subscription with status=`trial`, `trialEndsAt = now + plan.trialDays`. Refuses if an active sub already exists.
- `chargeRenewal(subscriptionId)` — debits seats × per_seat_cents, advances `currentPeriodStart/End`, status→`active`. Returns `{ ok, transactionId }` or `{ ok:false, reason:'insufficient_funds' }`.
- `tickRenewals(now=Date.now())` — for each subscription:
  - `trial` whose `trialEndsAt <= now` → try `chargeRenewal`. Success → `active`. Failure → `grace` with `graceEndsAt = trialEndsAt + plan.gracePeriodDays*day`.
  - `active` whose `currentPeriodEnd <= now` → try `chargeRenewal`. Success extends. Failure → `grace`.
  - `grace` whose `graceEndsAt <= now` → `suspended`.
  - Suspended is reactivated explicitly via `chargeRenewal` (we'll wire that into topup webhook in Task 6).

Tests: each transition with deterministic `now` injection.

---

## Task 4 — Billing routes (read-side + topup initiation)

**Files**
- Create `apps/api/src/routes/billing.ts`
- Create `apps/api/src/routes/billing.test.ts`
- Modify `apps/api/src/app.ts` to mount `v1.route('/billing', billingRoutes)`.

Endpoints (all `sessionAuth`-gated except `GET /plans` which is public-ish but session-auth too —
admin-V3-only, end-users don't see this):
- `GET /api/v1/billing/plans` → list active plans + features
- `GET /api/v1/billing/subscription` → org subscription + plan snapshot
- `GET /api/v1/billing/wallet` → balance + last 20 txs
- `GET /api/v1/billing/wallet/transactions?limit=&offset=` → paginated ledger
- `POST /api/v1/billing/subscribe` `{ planCode, seats? }` → `startTrial`
- `POST /api/v1/billing/topup` `{ amountCents, method, msisdn, displayAmount?, displayCurrency? }`
  → calls Wistfare client, persists `collection_attempts` row with idempotencyKey=generateId('idem'),
  returns `{ id, status, providerCollectionId }`
- `GET /api/v1/billing/topup/:id` → current attempt row

Tests use the existing PGlite fixture + cookie-based session auth helper (build via `AuthService.createSession`).

---

## Task 5 — Webhook receiver

**Files**
- Add to `apps/api/src/routes/billing.ts` — `POST /api/v1/billing/webhooks/wistfare`
- Tests in `billing.test.ts`

Behavior:
1. Header `X-Wistfare-Secret` must equal `process.env.WISTFARE_WEBHOOK_SECRET`. Reject 401.
2. Parse payload (Wistfare schema: `event`, `transaction_id`, `transaction_type`, `status`, `amount`, `currency`, `business_wallet_id`, `payment_method`, `reference_id`, …).
3. Lookup `collection_attempts` by `providerCollectionId = transaction_id`. If not found, also try `idempotencyKey = reference_id` (we send our id as reference_id). Store `lastWebhookPayload`.
4. On `collection.completed` / `payment.completed`:
   - Update attempt → `succeeded`, `completedAt=now`.
   - Credit wallet via `BillingService.creditWallet(provider='wistfare_collections', providerRef=transaction_id)` — idempotent.
   - If org has `suspended` subscription, immediately try `chargeRenewal`.
5. On `collection.failed` / `payment.failed`:
   - Update attempt → `failed`, store `failureReason`.
   - No ledger op.
6. Respond `200 { ok: true }` always (even on dup) — Wistfare retries non-2xx.

Tests: success path credits, duplicate webhook is no-op, failure path marks attempt, unknown event types respond 200, bad secret 401.

---

## Task 6 — Internal tick endpoint

**Files**
- Add to `apps/api/src/routes/billing.ts` — `POST /api/v1/billing/internal/tick`
- Tests in `billing.test.ts`

Gated by `X-Inbound-Secret` matching `INBOUND_SECRET` (same secret mail-engine uses for the
`/api/v1/internal/*` calls — keeps ops simple). Calls `BillingService.tickRenewals()`. Returns
`{ transitions: { activated, gracePeriod, suspended, charged } }`.

We'll wire docker-compose cron in Phase I.

---

## Task 7 — ensureSchema mirror & route registration verify

`apps/api/src/index.ts` — already has the 4 billing tables in `ensureSchema()`. No change unless
something is missing. Run typecheck to confirm.

---

## Task 8 — End-to-end smoke

Add a single integration test `apps/api/src/routes/billing-e2e.test.ts` that:
1. Seeds org/user/session, calls `/billing/plans` → sees Team.
2. Calls `/billing/subscribe { planCode: 'team' }` → trial sub created.
3. Calls `/billing/topup { amountCents: 600, method: 'mtn_momo', msisdn: '250788000000' }` → attempt pending.
4. Posts `/billing/webhooks/wistfare` (collection.completed) → wallet credited 600c.
5. Calls `/billing/internal/tick` with trial expiry warped to past → sub now `active`, $6 debited (2 months @ 1 seat $3).
   - Actually trialEndsAt < now triggers single charge: balance 600 − 300 = 300, sub active.
6. Verifies ledger has trial_credit + topup + renewal_charge rows in order.

Run: `pnpm --filter @wistmail/api test billing-e2e`.

---

## Task 9 — Wrap

- All tests green: `pnpm --filter @wistmail/api test` and `pnpm --filter @wistmail/db test`.
- Typecheck clean: `pnpm --filter @wistmail/api typecheck`.
- Mark phase complete with commit hashes.
- Commit plan update.

---

## Status

- [x] Task 1 — Wistfare client (commit fceb7ac)
- [x] Task 2 — Wallet ledger primitives (commit 5f709d1)
- [x] Task 3 — Subscription lifecycle (commit 5f709d1)
- [x] Task 4 — Billing routes (read + topup initiation) (commit 19ac541)
- [x] Task 5 — Webhook receiver (commit 19ac541)
- [x] Task 6 — Internal tick endpoint (commit 19ac541)
- [x] Task 7 — ensureSchema verify (no change needed; pre-existing 10d7214)
- [x] Task 8 — E2E smoke (covered by `billing routes > full e2e: …` in 19ac541)
- [x] Task 9 — Wrap

## Final State

- 4 new commits since Phase C complete (cbb8964 → 19ac541).
- apps/api tests: 336 passing (28 of those new)
- packages/db tests: 40 passing (unchanged)
- Branch: `feat/v3-email-templates`
- All wired: `getDb()` + `ensureSchema` + `seedSystemData` + Wistfare stub mode.
