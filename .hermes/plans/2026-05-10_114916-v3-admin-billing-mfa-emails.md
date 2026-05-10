# WistMail V3 Admin / Billing / MFA / Email Templates — Implementation Plan

> **For Hermes:** Use `subagent-driven-development` skill to execute this plan. Each phase is a fresh subagent, two-stage review (spec compliance → code quality) per task. Do **not** start until the user resolves the open questions in §0.

**Goal:** Bring the WistMail web app to pixel-faithful parity with every `*V3` and `Email/V3-*` frame in `design.lib.pen`, with end-to-end working flows for: Admin Overview, Users management & creation, Billing (Plan & Usage, Top-up, Add Payment, Invoices), MFA challenge & setup, and the five transactional email templates. All work tested locally on Docker (OrbStack) against an example domain.

**Architecture:**
- Web (`apps/web`, Next.js 15, App Router, Tailwind, Vitest) — UI screens & components.
- API (`apps/api`, Hono/Express + Drizzle ORM) — billing routes, email rendering, MFA endpoints.
- DB (`packages/db`, Postgres via Drizzle) — new billing schema (wallet, transactions, payment_methods, invoices, subscriptions, plans).
- Mail engine (`packages/mail-engine`, Go) — already handles SMTP outbound; consumed by API for transactional emails.
- Email templates: TS modules in `apps/api/src/templates/` (matches existing pattern: `mfa-code.ts`, `invitation.ts`, `password-reset.ts`).
- Docker compose (`docker-compose.yml`) is the canonical local test target via OrbStack.

**Design source-of-truth:** `design.lib.pen` (JSON, 9 MB). Per-screen extracts are saved at `/tmp/wistmail-design/Screen_*.txt` and `/tmp/wistmail-design/Email_*.txt` for fast subagent reference.

---

## 0. Open Questions — REQUIRED before any code is written

These are blocking. I do **not** want to invent answers and then rebuild later.

1. **Payment provider(s).** The design shows Visa cards, MTN Mobile Money (+250 numbers), Airtel Money, Bank ACH (BK Rwanda), USD↔RWF conversion. Which providers do we actually integrate?
   - Card: Stripe / Flutterwave / IntaSend / Paystack / mock for v1?
   - MoMo / Airtel: Flutterwave Collect / IntaSend / direct MTN OpenAPI / mock?
   - Bank ACH: out of scope for v1?
   - **Recommendation:** Flutterwave or IntaSend (single integration, covers card + MoMo + Airtel in Rwanda). Confirm.
2. **Billing model is the wallet pattern,** confirmed by the design copy: prepaid wallet, monthly seat renewal debits wallet, top-up triggers grace period if low. Can I assume:
   - Plan: `Team` at `$3/user/month` (from design).
   - Trial: 7 days (from design "TRIAL · DAY 5 OF 7").
   - Currencies: store in USD cents, display USD with RWF approximation using a configurable rate.
   - Auto-recharge optional, threshold + amount configurable.
3. **Multi-tenant scope of billing.** One workspace = one wallet/subscription, right? (Matches the data shape in the design and existing `org-from.ts`.)
4. **Who can hit billing pages?** OWNER only, or OWNER + ADMIN? Audit log entry on every billing mutation — yes?
5. **WhatsApp clarification channel is NOT connected.** `send_message(action='list')` returns no platforms. Either wire it up (`hermes setup` for the WhatsApp bridge) or accept that I'll batch questions in this chat. For now I'm assuming the latter.
6. **Existing components to reconcile.** I see code already has: `email-row-v3.tsx`, `email-v3.test.tsx`, `today-panel.tsx`, MFA pages under `/mfa/*` and `/settings/two-factor/*`, an admin shell with placeholder billing nav (`/admin/plan`). Do you want me to delete or migrate the V1/V2 admin pages (`admin/members`, `admin/users`), or keep them as fallbacks?
7. **"Pixel perfect" scope.** Strict pixel parity at 1460×900 (the design canvas) with graceful responsive collapse — agreed? Tablet breakpoints exist for some V3 screens (`InboxV3-Tablet` etc.) but not for Admin/Billing — I'll match desktop only and let it reflow with sensible mobile fallbacks.
8. **Email rendering library.** Existing templates are inline-styled string TS. For visual fidelity I'd add `@react-email/components` + `@react-email/render` (industry standard). OK?

I will not dispatch implementation agents until #1, #2, #4, #6, #8 are answered. The rest I can default to my recommendations and call out in the PR.

---

## 1. Inventory: design ↔ code gap (current as of 2026-05-10)

| V3 screen / asset (design name) | Code path today | State | Action |
|---|---|---|---|
| Screen/LoginV3 | `app/(auth)/login/page.tsx` | exists, V2-ish | QA pass, restyle |
| Screen/SetupV3-* (5 steps) | `app/setup/_components/*` | exists | QA pass; wizard steps map 1:1 |
| Screen/MFAChallengeV3 | `app/(auth)/mfa/challenge/page.tsx` | exists | QA pass; check 6-digit code UI matches |
| Screen/SettingsV3-TwoFactor | `app/(app)/settings/two-factor/page.tsx` | exists | QA pass; check method list & backup codes UI |
| Screen/SettingsV3-* (Account, Signatures, Notifications, Storage, Labels, Domains, APIKeys, Webhooks) | `app/(app)/settings/*` | mostly exist | QA pass each |
| Screen/InboxV3, InboxV3-Empty, InboxV3-Thread, InboxV3-Thread-OneToOne, InboxV3-NewAll, InboxV3-NewMail, InboxV3-NewChat | `app/(app)/inbox/page.tsx` + `components/email/*` | exists; `email-row-v3.tsx` present | QA pass + close gaps |
| Screen/AdminV3-Overview | `app/(app)/admin/page.tsx` | partial; placeholder cards | **Rebuild to match design** (live stats, charts, top-users-by-storage, domains panel, recent admin activity) |
| Screen/AdminV3-Users | `app/(app)/admin/users/page.tsx` | partial | **Rebuild to V3 spec** |
| Screen/AdminV3-CreateUser | `app/(app)/admin/users/new/page.tsx` | partial | **Rebuild to V3 spec** |
| Screen/AdminV3-Domains | none | **MISSING** | **Build new** |
| Screen/AdminV3-Organization | `app/(app)/admin/organization/page.tsx` | partial | QA pass + rebuild |
| Screen/AdminV3-AuditLog | `app/(app)/admin/audit-logs/page.tsx` | partial | QA pass |
| Screen/AdminV3-Analytics | none | **MISSING** | **Build new** |
| **Screen/AdminV3-Billing** | none (sidebar links to `/admin/plan` placeholder) | **MISSING** | **Build new (full stack)** |
| **Screen/AdminV3-Billing-TopUp** | none | **MISSING** | **Build new** |
| **Screen/AdminV3-Billing-AddPayment** | none | **MISSING** | **Build new** |
| **Screen/AdminV3-Billing-Invoices** | none | **MISSING** | **Build new** |
| **Email/V3-AdminWelcome** | none (existing `invitation.ts` is V1) | **MISSING** | **Build new** |
| **Email/V3-UserInvitation** | `apps/api/src/templates/invitation.ts` (V1) | needs replacement | **Replace** |
| **Email/V3-UserWelcome** | none | **MISSING** | **Build new** |
| **Email/V3-ExpiryReminder** | none | **MISSING** | **Build new** |
| **Email/V3-TopUpConfirmation** | none | **MISSING** | **Build new** |

Notable code-side findings:
- `admin-sidebar.tsx` already lists Workspace / Observability / Billing groups but billing only has one item (`Plan & usage`) — V3 design wants `Plan & usage`, `Invoices`, `Top up` (and the trial pill `TRIAL · DAY 5 OF 7` next to the workspace header).
- No DB schema for billing (`grep bill|payment|invoice|subscription` in `packages/db/src/schema/` returns nothing).
- No billing routes in `apps/api/src/routes/`.
- The `apps/api` already has `templates/{mfa-code,invitation,password-reset}.ts` — established convention to follow.

---

## 2. Phases (each phase = one or more bite-sized tasks; subagents dispatched per task)

### Phase A — Foundation (ENV, scaffolding, fixtures)
- A1. Configure local docker stack (OrbStack): `cp .env.example .env`, set `MAIL_DOMAIN=example.test`, `POSTGRES_PASSWORD=…`, build & boot `docker compose up -d postgres redis api web`. Verify `/api/v1/healthz`. Smoke-test login.
- A2. Add a Vitest visual-regression harness for V3 screens: `apps/web/src/test/v3-snapshots.test.tsx` rendering each page with mocked queries, exporting Storybook-style stories under `apps/web/src/stories/v3/*`. Wire a `pnpm test:v3` task.
- A3. Add `@react-email/components` + `@react-email/render` to `apps/api`. Smoke-render existing `invitation.ts` through it to confirm.

### Phase B — Email templates V3 (no UI dependency, easiest to land first)
For each: (a) build component, (b) snapshot test the rendered HTML against fixture, (c) wire into the relevant API route, (d) preview at `/api/v1/admin/email-preview/:slug` (dev-only).
- B1. `Email/V3-AdminWelcome` → `apps/api/src/templates/admin-welcome.tsx`. Sent at end of `setup` flow (`routes/setup.ts`). Triggered when first OWNER account is created post-domain-verify.
- B2. `Email/V3-UserInvitation` → replace `templates/invitation.ts`. Includes credential card (email, temp password, login URL). Triggered from `routes/admin.ts` user-create.
- B3. `Email/V3-UserWelcome` → `templates/user-welcome.tsx`. Sent on first successful login by an invited user (or after they set their password). Feature-grid layout per design.
- B4. `Email/V3-ExpiryReminder` → `templates/expiry-reminder.tsx`. Sent by a cron/scheduled task in `apps/ai-worker` (or new `apps/billing-worker`) when wallet < threshold OR renewal in < 3 days.
- B5. `Email/V3-TopUpConfirmation` → `templates/topup-confirmation.tsx`. Sent on successful wallet top-up (webhook handler).

### Phase C — Billing data model (DB)
- C1. New schema files under `packages/db/src/schema/`: `plans.ts`, `subscriptions.ts`, `wallets.ts`, `wallet_transactions.ts`, `payment_methods.ts`, `invoices.ts`. Drizzle migrations checked in. Seed `Team` plan @ $3/seat/month, 7-day trial.
- C2. Schema unit tests in `packages/db/src/schema.test.ts` covering FK constraints and enum values.

### Phase D — Billing API
- D1. `apps/api/src/services/billing.ts` — pure logic (charge wallet, queue renewal, compute "wallet short" delta, generate invoice number, etc.).
- D2. `apps/api/src/services/payment-providers/{flutterwave,intasend,mock}.ts` — provider adapter behind a `PaymentProvider` interface. v1: ship the `mock` provider that "succeeds" instantly; gate real provider on env. (Pending Q1 answer.)
- D3. `apps/api/src/routes/billing.ts` — endpoints:
  - `GET /api/v1/billing/overview` (wallet, plan, renewal, seats, recent txns, usage)
  - `GET /api/v1/billing/invoices?status=&limit=&offset=`
  - `GET /api/v1/billing/payment-methods`
  - `POST /api/v1/billing/payment-methods` (add)
  - `DELETE /api/v1/billing/payment-methods/:id`
  - `PATCH /api/v1/billing/payment-methods/:id/default`
  - `POST /api/v1/billing/topup` → returns provider redirect / pending intent
  - `POST /api/v1/billing/webhook/:provider` → idempotent handler
- D4. Auth guard: OWNER (and ADMIN if Q4 says so). Audit log every mutation.
- D5. Tests: route-level Vitest with the mock provider; webhook idempotency tests; race condition test for double top-up.

### Phase E — Billing UI (V3)
For each page: build to pixel parity with the design extract, wire to API, write Vitest test, add Storybook story.
- E1. `app/(app)/admin/billing/layout.tsx` + sub-sidebar tab strip (`Plan & usage`, `Invoices`, `Top up` per design pill row). Update `admin-sidebar.tsx` to add the trial pill `TRIAL · DAY n OF 7`.
- E2. `app/(app)/admin/billing/page.tsx` → `Screen/AdminV3-Billing`. Wallet card, plan card, renewal card, seats card, alert banner, recent transactions, usage panel, payment methods strip.
- E3. `app/(app)/admin/billing/top-up/page.tsx` → `Screen/AdminV3-Billing-TopUp`. Amount input + chips ($10/$25/$50/$100/$250), USD↔RWF live conversion, payment method picker, totals breakdown, `CONFIRM TOP-UP`.
- E4. `app/(app)/admin/billing/payment-methods/new/page.tsx` → `Screen/AdminV3-Billing-AddPayment`. Tab between CARD / MOBILE MONEY. Card form (number, expiry, CVC, name, country, set-default toggle). Mobile money form (provider, MSISDN, set-default).
- E5. `app/(app)/admin/billing/invoices/page.tsx` → `Screen/AdminV3-Billing-Invoices`. KPI strip (paid this year / outstanding / next invoice / avg per month), filter chips (ALL/PAID/OPEN/FAILED), period filter, table.

### Phase F — Admin V3 (non-billing) parity
- F1. Overview rebuild → exact match for stat cards, message-volume chart (use `recharts`, already a candidate dep), top-users-by-storage list, recent admin activity, domains strip.
- F2. Users list rebuild + Create User rebuild + Edit User rebuild.
- F3. Domains page (new file).
- F4. Organization rebuild.
- F5. Audit log QA pass.
- F6. Analytics page (new).

### Phase G — MFA V3 parity
- G1. `Screen/MFAChallengeV3` — verify 6-digit code UI matches (font sizes, decor pane copy "YOUR INBOX, BUILT FOR FOCUS.", shield icon, eyebrow `TWO-FACTOR · REQUIRED`).
- G2. `Screen/SettingsV3-TwoFactor` — methods list (TOTP, email, backup codes), enable/disable, regenerate backup codes.

### Phase H — Inbox V3 detail QA pass
- H1. Diff `email-row-v3.tsx`, `inbox/page.tsx`, `thread-reader.tsx` against the design extracts. File a list of deltas, fix each.
- H2. Empty state, thread view, one-to-one thread view, NewAll/NewMail/NewChat panels.

### Phase I — Local end-to-end test
- I1. Boot full Docker stack via OrbStack. Configure `example.test` domain (override DNS via `/etc/hosts` + a Caddy local cert; `Caddyfile` exists already).
- I2. Browser tool walkthrough: login → setup wizard → admin overview → invite user → check invite email rendered HTML in Mailhog (add `mailhog` service to compose for test) → top-up flow with mock provider → invoice appears → topup-confirmation email rendered → expiry reminder cron forced via test endpoint.
- I3. Capture browser screenshots side-by-side with the design exports for the 18 V3 frames; produce a `docs/v3-parity-report.md` with diffs and approval checklist.

### Phase J — Optimization & maintainability pass
- J1. Profile route bundle stats (`apps/web/.next/diagnostics/route-bundle-stats.json` already exists) — flag any route > 250kb gz, code-split.
- J2. Verify React Query cache keys are namespaced per workspace.
- J3. Run Playwright on critical billing flows (top-up, add card, view invoice).
- J4. Lighthouse pass on Admin Overview & Inbox V3.

---

## 3. Files likely to change / create

**Create:**
- `packages/db/src/schema/{plans,subscriptions,wallets,wallet_transactions,payment_methods,invoices}.ts`
- `apps/api/src/routes/billing.ts`
- `apps/api/src/services/billing.ts`
- `apps/api/src/services/payment-providers/{index,types,mock,flutterwave|intasend}.ts`
- `apps/api/src/templates/{admin-welcome,user-welcome,expiry-reminder,topup-confirmation}.tsx`
- `apps/web/src/app/(app)/admin/billing/{layout,page}.tsx`
- `apps/web/src/app/(app)/admin/billing/top-up/page.tsx`
- `apps/web/src/app/(app)/admin/billing/payment-methods/new/page.tsx`
- `apps/web/src/app/(app)/admin/billing/invoices/page.tsx`
- `apps/web/src/app/(app)/admin/{domains,analytics}/page.tsx`
- `apps/web/src/components/billing/*` (wallet-card, plan-card, renewal-card, seats-card, txn-row, usage-row, payment-method-card, amount-chips, fx-quote)
- `apps/web/src/lib/billing-queries.ts`
- `docs/v3-parity-report.md`

**Modify:**
- `apps/api/src/templates/invitation.ts` (replace with V3)
- `apps/web/src/components/shell/admin-sidebar.tsx` (add billing children + trial pill)
- `apps/web/src/app/(app)/admin/page.tsx` (rebuild)
- `apps/web/src/app/(app)/admin/users/{page,new/page}.tsx` (rebuild)
- `apps/web/src/app/(app)/admin/{organization,audit-logs}/page.tsx` (QA)
- `docker-compose.yml` (add `mailhog:1025/8025` for local testing)
- `.env.example` (add billing/payment-provider keys)

---

## 4. Tests / Validation

- Vitest unit + component tests collocated next to source (per AGENTS.md).
- Drizzle schema tests in `packages/db/src/schema.test.ts`.
- API route tests against Postgres in Docker.
- Visual snapshots for all 18 V3 frames.
- Playwright E2E for: login → setup → invite → top-up → invoice download.
- Manual browser-tool screenshot diff against design extract for each of the 18 frames before phase sign-off.

---

## 5. Risks & tradeoffs

- **Payment provider lock-in** — mitigated by the `PaymentProvider` adapter interface; `mock` provider lets us ship UI before any real integration.
- **Pixel parity vs. responsiveness** — strict 1460×900 parity will break on narrow viewports unless we add breakpoints. Plan: match desktop exactly, add `md:` and `sm:` graceful collapse, document tablet only where the design provides it.
- **Currency / FX** — design hard-codes USD with RWF approximation. v1: store FX rate in env, cron refresh from a free source (exchangerate.host). Document that this is approximate (display-only); actual settlement is in the provider's currency.
- **Email rendering across clients** — `@react-email` handles most quirks; we still snapshot rendered HTML and at least eyeball Gmail / Outlook web during Phase I.
- **Scope creep** — this plan is large (~30 tasks). I'd rather land Phases B + C + D + E first (the work you specifically called out) and treat F/G/H as separate PRs.

---

## 6. Execution protocol (when approved)

1. Resolve §0 questions.
2. Run Phase A live (I do this myself, not via subagent — env setup needs my judgment).
3. Phases B onwards executed via `subagent-driven-development`: one subagent per task, spec-compliance review, then code-quality review, commit, next task.
4. After each phase: I run the full test suite, snapshot the relevant V3 frames in the browser, post a phase-completion summary in chat with diffs.
5. Final integration pass: full e2e on Docker, parity report committed, PR opened.

---

**Saved at:** `.hermes/plans/2026-05-10_114916-v3-admin-billing-mfa-emails.md`
