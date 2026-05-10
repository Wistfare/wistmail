-- 0009_billing_wallet_and_subscriptions.sql
--
-- Adds the billing runtime tables on top of 0008 (plans + RBAC catalog):
--   wallets              — per-org prepaid USD balance
--   subscriptions        — org → plan + status state machine
--   wallet_transactions  — append-only ledger, idempotent on (provider, ref)
--   collection_attempts  — Wistfare Collections lifecycle
--
-- Idempotent on top of `ensureSchema()` — every CREATE guarded with IF NOT EXISTS
-- so re-applying after a legacy boot never errors.

CREATE TABLE IF NOT EXISTS "wallets" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "org_id" varchar(64) NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "balance_cents" bigint DEFAULT 0 NOT NULL,
  "currency" varchar(8) DEFAULT 'USD' NOT NULL,
  "frozen" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "wallets_org_uidx" ON "wallets" ("org_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "subscriptions" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "org_id" varchar(64) NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "plan_id" varchar(64) NOT NULL REFERENCES "plans"("id") ON DELETE RESTRICT,
  "status" varchar(24) DEFAULT 'trial' NOT NULL,
  "seats" integer DEFAULT 1 NOT NULL,
  "trial_started_at" timestamp with time zone,
  "trial_ends_at" timestamp with time zone,
  "current_period_start" timestamp with time zone,
  "current_period_end" timestamp with time zone,
  "grace_ends_at" timestamp with time zone,
  "cancelled_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "subscriptions_org_active_uidx" ON "subscriptions" ("org_id") WHERE status <> 'cancelled';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscriptions_status_idx" ON "subscriptions" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscriptions_period_end_idx" ON "subscriptions" ("current_period_end");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "wallet_transactions" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "wallet_id" varchar(64) NOT NULL REFERENCES "wallets"("id") ON DELETE RESTRICT,
  "org_id" varchar(64) NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "amount_cents" bigint NOT NULL,
  "balance_after_cents" bigint NOT NULL,
  "reason" varchar(32) NOT NULL,
  "provider" varchar(32),
  "provider_ref" varchar(128),
  "subscription_id" varchar(64),
  "note" text,
  "metadata" jsonb,
  "initiated_by" varchar(64) REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wallet_transactions_wallet_idx" ON "wallet_transactions" ("wallet_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wallet_transactions_org_idx" ON "wallet_transactions" ("org_id", "created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "wallet_transactions_provider_ref_uidx" ON "wallet_transactions" ("provider", "provider_ref") WHERE provider IS NOT NULL AND provider_ref IS NOT NULL;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "collection_attempts" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "org_id" varchar(64) NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "initiated_by" varchar(64) NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "idempotency_key" varchar(128) NOT NULL,
  "provider_collection_id" varchar(128),
  "method" varchar(24) NOT NULL,
  "msisdn" varchar(32) NOT NULL,
  "amount_cents" bigint NOT NULL,
  "display_amount" bigint,
  "display_currency" varchar(8),
  "status" varchar(24) DEFAULT 'pending' NOT NULL,
  "failure_reason" text,
  "request_payload" jsonb,
  "last_webhook_payload" jsonb,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "collection_attempts_idem_uidx" ON "collection_attempts" ("idempotency_key");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "collection_attempts_provider_uidx" ON "collection_attempts" ("provider_collection_id") WHERE provider_collection_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "collection_attempts_org_idx" ON "collection_attempts" ("org_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "collection_attempts_status_idx" ON "collection_attempts" ("status");
