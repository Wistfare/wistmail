-- 0008_billing_plans_and_rbac.sql
--
-- Adds the plan + plan_features catalog (used by the billing service to
-- price renewals and gate features) and the RBAC tables (roles,
-- role_permissions, org_role_assignments).
--
-- This migration is idempotent on top of `ensureSchema()` — every CREATE is
-- guarded with IF NOT EXISTS so re-applying after a legacy boot never errors.

CREATE TABLE IF NOT EXISTS "plans" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "code" varchar(64) NOT NULL,
  "name" varchar(128) NOT NULL,
  "description" text,
  "per_seat_cents" integer NOT NULL,
  "included_storage_mb_per_seat" integer DEFAULT 1024 NOT NULL,
  "trial_days" integer DEFAULT 7 NOT NULL,
  "grace_period_days" integer DEFAULT 7 NOT NULL,
  "currency" varchar(8) DEFAULT 'USD' NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "sort_order" integer DEFAULT 100 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "plans_code_uidx" ON "plans" ("code");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "plan_features" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "plan_id" varchar(64) NOT NULL REFERENCES "plans"("id") ON DELETE CASCADE,
  "key" varchar(128) NOT NULL,
  "value" jsonb,
  "label" varchar(255),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "plan_features_plan_key_uidx" ON "plan_features" ("plan_id", "key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "plan_features_plan_idx" ON "plan_features" ("plan_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "roles" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "code" varchar(64) NOT NULL,
  "name" varchar(128) NOT NULL,
  "description" text,
  "org_id" varchar(64) REFERENCES "organizations"("id") ON DELETE CASCADE,
  "is_system" boolean DEFAULT false NOT NULL,
  "level" integer DEFAULT 10 NOT NULL,
  "grants_admin_access" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "roles_system_code_uidx" ON "roles" ("code") WHERE org_id IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "roles_org_code_uidx" ON "roles" ("org_id", "code") WHERE org_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "roles_org_idx" ON "roles" ("org_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "role_permissions" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "role_id" varchar(64) NOT NULL REFERENCES "roles"("id") ON DELETE CASCADE,
  "permission" varchar(128) NOT NULL,
  "constraints" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "role_permissions_uidx" ON "role_permissions" ("role_id", "permission");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "role_permissions_role_idx" ON "role_permissions" ("role_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "org_role_assignments" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "org_id" varchar(64) NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "user_id" varchar(64) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "role_id" varchar(64) NOT NULL REFERENCES "roles"("id") ON DELETE RESTRICT,
  "assigned_by" varchar(64) REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "org_role_assignments_uidx" ON "org_role_assignments" ("org_id", "user_id", "role_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "org_role_assignments_org_user_idx" ON "org_role_assignments" ("org_id", "user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "org_role_assignments_role_idx" ON "org_role_assignments" ("role_id");
