# Phases E → J — Admin V3, Billing UI, MFA, Parity, Docker, Optimization

> Master plan covering everything left in the WistMail V3 rebuild.
> Phases A–D shipped (transactional emails, billing schema, billing API).
> This document is the single source of truth for E–J. Each phase has
> explicit screens, design IDs (Pencil), backend endpoints, file paths,
> and exit criteria.

**Branch:** `feat/v3-email-templates` (current). Phase work lands as worktree branches that merge back when green.

**Source of truth (UI):** `wistmail/design.lib.pen`. Open with the pencil MCP and use the IDs below.

**Conventions (from `CLAUDE.md`):** TypeScript strict, no `any`, Zod for validation, no semicolons, single quotes, conventional commits, every feature has unit tests, Vitest for Node.

**Working rules for every phase:**
1. Read the relevant Pencil frame **before** writing code (`mcp__pencil__get_screenshot` for visual + `snapshot_layout` for structure).
2. Pixel-faithful: tokens, padding, radius, font sizes match the frame. Tokens already live in `apps/web/src/app/globals.css`.
3. New backend endpoint? Add unit tests in `*.test.ts` next to it; cover idempotency + auth + happy + error paths.
4. New UI page? Add a component-level test with React Testing Library at `*.test.tsx`.
5. Ship behind a typecheck-clean + tests-green gate. Run:
   ```
   pnpm --filter @wistmail/api typecheck && pnpm --filter @wistmail/api test
   pnpm --filter @wistmail/web typecheck && pnpm --filter @wistmail/web test
   ```
6. **Never** invent backend shapes — if an endpoint is missing, add it (with tests) before wiring the UI.

---

## Pencil node ID index (build targets)

### Admin V3 (Phases E, F)

| ID | Screen | Web route | Phase |
|----|--------|-----------|-------|
| `boHfA` | AdminV3-Overview | `/admin` | F (polish) |
| `hxB5G` | AdminV3-Users | `/admin/users` | F (polish) |
| `udt2q` | AdminV3-CreateUser | `/admin/users/new` | F (polish) |
| `m7EUl` | AdminV3-Analytics | `/admin/analytics` | F (new) |
| `yDvd5` | AdminV3-AuditLog | `/admin/audit-logs` | F (polish) |
| `VxCMA` | AdminV3-Organization | `/admin/organization` | F (polish) |
| `ZowPj` | AdminV3-Domains | `/admin/domains` | F (new admin variant) |
| `FHgAk` | AdminV3-Billing | `/admin/billing` | **E** |
| `iz5TA` | AdminV3-Billing-Plan | `/admin/billing/plan` | **E** |
| `W2Hdlo` | AdminV3-Billing-TopUp | `/admin/billing/topup` | **E** |
| `ryBKw` | AdminV3-Billing-Invoices | `/admin/billing/invoices` | **E** |
| `zKxtf` | AdminV3-Billing-Storage | `/admin/billing/storage` | **E** |
| `o4uBd` | AdminV3-Billing-AddPayment | `/admin/billing/payment` | **E** |

### MFA V3 (Phase G)

| ID | Screen | Web route |
|----|--------|-----------|
| `XTWjb` | MFAChallengeV3 | `/mfa/challenge` (exists; verify parity) |
| `qne6O` | MfaSetupChooser | `/mfa/setup` |
| `yYUsl` | MfaTotpSetup | `/mfa/setup/totp` |
| `KoLiZ` | MfaEmailSetup | `/mfa/setup/email` |
| `A6tHu` | MfaBackupCodes | `/mfa/backup-codes` (display, regenerate) |
| `dL0cR` | MfaMethodsSettings | `/settings/two-factor` (V3 retrofit) |

### Settings V3 (touched in phases F + G as relevant)

| ID | Screen | Web route |
|----|--------|-----------|
| `QWQRT` | SettingsV3-Account | `/settings/account` |
| `EJary` | SettingsV3-TwoFactor | `/settings/two-factor` |
| `D51HF` | SettingsV3-APIKeys | `/settings/api-keys` |
| `F1QP2N` | SettingsV3-Domains | `/settings/domains` |
| `P9vrQn` | SettingsV3-Labels | `/settings/labels` |
| `tyyA2` | SettingsV3-Notifications | `/settings/notifications` |
| `oNDps` | SettingsV3-Signatures | `/settings/signatures` |
| `Rn5T8` | SettingsV3-Storage | `/settings/storage` |
| `TsMMQ` | SettingsV3-Webhooks | `/settings/webhooks` |

---

## Phase E — Billing UI (admin)

**Goal:** wire all 6 admin billing screens to the Phase D `/api/v1/billing/*` endpoints.

### E.1 New web routes
- `apps/web/src/app/(app)/admin/billing/page.tsx` — wallet balance, active subscription card, recent transactions strip, top-up CTA. Pencil: `FHgAk`.
- `apps/web/src/app/(app)/admin/billing/plan/page.tsx` — current plan card + plan picker (cards). Pencil: `iz5TA`.
- `apps/web/src/app/(app)/admin/billing/topup/page.tsx` — amount selector, mtn_momo / airtel_money pills, msisdn input, confirm. Pencil: `W2Hdlo`.
- `apps/web/src/app/(app)/admin/billing/invoices/page.tsx` — paginated ledger table with download CTA per row. Pencil: `ryBKw`.
- `apps/web/src/app/(app)/admin/billing/storage/page.tsx` — storage breakdown (mail / attachments / drafts / trash) + per-user list. Pencil: `zKxtf`.
- `apps/web/src/app/(app)/admin/billing/payment/page.tsx` — saved methods list + add new (mtn_momo / airtel_money). Pencil: `o4uBd`.

### E.2 New shared components
- `apps/web/src/components/billing/wallet-card.tsx`
- `apps/web/src/components/billing/plan-card.tsx`
- `apps/web/src/components/billing/transaction-row.tsx`
- `apps/web/src/components/billing/topup-form.tsx`
- `apps/web/src/components/billing/payment-method-row.tsx`
- `apps/web/src/components/billing/index.ts` (barrel)

### E.3 AdminSidebar additions
- Replace `Plan & usage → /admin/plan` placeholder with full Billing section:
  - Billing → `/admin/billing`
  - Plan → `/admin/billing/plan`
  - Invoices → `/admin/billing/invoices`
  - Storage → `/admin/billing/storage`
  - Payment methods → `/admin/billing/payment`

### E.4 Backend additions
Phase D covers most of what we need. Likely **gaps**:
- `GET /api/v1/billing/storage-breakdown` — returns `{ totalBytes, byCategory: { mail, attachments, drafts, trash }, byUser: [...] }` for the storage page.
- `GET /api/v1/billing/payment-methods` — currently nothing persists payment methods (we initiate collections per-topup). For now, derive distinct `(method, msisdn)` from `collection_attempts` history. Add an endpoint that does this aggregation. No new schema yet.

Add these to `apps/api/src/routes/billing.ts`. Add unit tests in `billing.test.ts` (extend existing file).

### E.5 Tests
- Web: per-page render test that mocks the API responses and asserts the right copy/elements appear (wallet balance formatted, plan name, etc.).
- API: assert new endpoints return the right shape under session auth, 401 without.

### E.6 Exit criteria
- All 6 routes navigate from AdminSidebar.
- A round-trip topup against the stub Wistfare client (NODE_ENV=test path) renders the new transaction in the wallet/invoices pages.
- `pnpm --filter @wistmail/api test` green; `pnpm --filter @wistmail/web test` green.
- Screenshot diff against each Pencil frame attached to the commit.

---

## Phase F — Admin V3 rebuild (everything except billing)

**Goal:** every admin route is V3-pixel-faithful; analytics + admin domains are net-new.

### F.1 Polish existing
- `/admin` (Pencil `boHfA`): re-check stat strip values + audit timeline against the frame. Wire stats to real endpoints (members count, storage, messages, domains). Add **chart** (bar) — Pencil shows a 7-day delivery / open trend. Backend: `GET /api/v1/admin/overview-stats?range=7d`.
- `/admin/users` (Pencil `hxB5G`): backend gain `status` column on `users` (or compute from `lastActiveAt`/invite state). Tabs Active/Pending/Suspended/Disabled actually filter rows. Columns: avatar, name+email, role, **storage used**, last active. Add row hover actions: edit / suspend / remove.
- `/admin/users/new` (Pencil `udt2q`): match form layout, include role picker, send-invite-email toggle.
- `/admin/audit-logs` (Pencil `yDvd5`): timeline-style list with action chips (login / member-add / role-change). Filter pills All/Auth/Org/Billing.
- `/admin/organization` (Pencil `VxCMA`): workspace card, name/slug edit, default sender, transfer-ownership block (danger zone).

### F.2 New
- `/admin/analytics` (Pencil `m7EUl`): KPI strip (sent / delivered / bounced / open rate), 30-day chart, top senders table. Backend: `GET /api/v1/admin/analytics?range=30d`. Reuses `analytics.ts` route file (extend).
- `/admin/domains` (Pencil `ZowPj`): admin-level domain list (vs settings/domains which is user-facing). Show DNS verification status + DKIM keys + last-checked. Backend: existing `/api/v1/setup/domains` + `/api/v1/admin/domains` as new admin scope.
- `/admin/security`: stub for now — Pencil doesn't have a dedicated screen; we'll surface 2FA-coverage and active sessions count in the AdminSidebar sub-page. Drop the `<ShieldCheck>` nav entry if no spec.

### F.3 Tests
- Each new page has a render test.
- Backend: new analytics + admin/domains endpoints have unit tests.

### F.4 Exit criteria
- AdminSidebar items all map to a real V3 screen.
- No "—" placeholders on `/admin` overview (real numbers, not stubs).

---

## Phase G — MFA V3

**Goal:** every MFA frame in the design has a matching screen, plus the settings retrofit.

### G.1 New web routes
- `/mfa/setup/page.tsx` — chooser (TOTP / Email / Backup codes). Pencil `qne6O`.
- `/mfa/setup/totp/page.tsx` — QR + manual code + verify input. Pencil `yYUsl`.
- `/mfa/setup/email/page.tsx` — email verification setup. Pencil `KoLiZ`.
- `/mfa/backup-codes/page.tsx` — display 10 codes, copy / regenerate. Pencil `A6tHu`.

### G.2 Settings retrofit
- `/settings/two-factor/page.tsx` — V3 chrome matching `dL0cR` & `EJary`: methods list (TOTP / Email / Backup codes) with status pills, "+ Add method" CTA → routes to `/mfa/setup`.

### G.3 Backend (`apps/api/src/routes/mfa.ts`)
Audit existing endpoints. Likely needed:
- `POST /api/v1/mfa/totp/setup` → returns `{ secret, qrCodeUrl }`.
- `POST /api/v1/mfa/totp/confirm` `{ code }` → enables TOTP.
- `POST /api/v1/mfa/email/setup` → triggers verification email.
- `POST /api/v1/mfa/email/confirm` `{ code }`.
- `GET /api/v1/mfa/backup-codes` (regenerate on POST).
- `GET /api/v1/mfa/methods` → list configured methods.

Add tests for each. Use `otplib` (or existing crypto util) for TOTP — verify it's already a dep (`apps/api/package.json`).

### G.4 Tests
- Components: OTP input handles paste, focus moves cell-by-cell, submit on full code.
- Backend: TOTP secret never leaks after first read, code window ±1 step, rate-limit on confirm.

### G.5 Exit criteria
- New user can enable TOTP from `/settings/two-factor` end-to-end without leaving the app.
- Existing `mfa/challenge` page still works for first-login flow.

---

## Phase H — Parity (close PHASE_AUDIT punch lists)

Open audit: `apps/web/PHASE_AUDIT.md`. Items remaining:

- **Phase 4 (Inbox)**: AUDIT-4.8 task drawer integration — deferred until AI extraction service ships. Verify; if blocked, leave with TODO comment + link.
- **Phase 5 (Calendar)**: AUDIT-5.1 mini-month, 5.2 Up-next card, 5.3 Calendars list, 5.4 Day grid, 5.5 "+ NEW" CTA position.
- **Phase 6 (Work)**: AUDIT-6.1 Today's flow rail, 6.2 Quick task FAB, 6.3 Overdue/Done counters in sidebar.
- **Phase 7 (Chat)**: AUDIT-7.1..7.4 — chat pages still use legacy rendering; refactor `/chat/page.tsx` and `/chat/[id]/page.tsx` to use the V3 primitives.
- **Phase 8 (Docs)**: AUDIT-8.1 outline sidebar, 8.2 comments rail, 8.3 status pill, 8.4 AI brief.

Each carries a screenshot diff before close.

---

## Phase I — Docker e2e

**Goal:** `docker compose up` brings up a working WistMail dev environment that exercises every shipped surface.

Tasks:
1. Audit `docker-compose.yml` — ensure services: api, web, mail-engine, postgres, redis, minio, meilisearch.
2. Add `cron` service (or BullMQ worker) hitting `POST /api/v1/billing/internal/tick` every 5 min with `INBOUND_SECRET`.
3. Smoke script `scripts/docker-smoke.sh`:
   - boot stack
   - run a Playwright (or curl-based) flow: signup → setup wizard → invite user → topup webhook → renewal tick → logout.
   - tear down.
4. Document in `docs/runbooks/local-dev.md`.

---

## Phase J — Optimization

Tasks:
1. Bundle audit: `pnpm --filter @wistmail/web build` + `next build --profile`. Identify top 3 heaviest routes. Split or lazy-load if a route ships >250 KB.
2. API response time pass: add `X-Response-Time` middleware (already exists?), dump p50/p95 for the 10 most-called endpoints under the smoke flow.
3. DB N+1 hunt: turn on `drizzle` query log under tests, fail-fast threshold (>30 queries/test).
4. Image audit: any PNGs > 200 KB in `apps/web/public/` should be SVG or webp.
5. Lighthouse pass on `/inbox`, `/calendar`, `/work`, `/admin`. Target perf ≥ 80, a11y ≥ 90.

---

## Status

- [x] Phase E — Billing UI (commits `0f8583f`..`0df1ba1`)
- [x] Phase F — Admin V3 polish + analytics + domains (commits `dbb202d`..`9e0f77d`)
- [x] Phase G — MFA V3 (commits `67f4de2`..`b3a2c03`)
- [x] Phase H — Parity punch lists (commits `1b68c79`..`2c24fb7`; H.A audit + 2 backend gaps, H.B audit + reactions end-to-end)
- [ ] Phase I — Docker e2e
- [x] Phase J — Optimization (commits `94869e8`..`a59538e`; bundle/N+1/response-time/image/Lighthouse audits under `docs/perf/`)
