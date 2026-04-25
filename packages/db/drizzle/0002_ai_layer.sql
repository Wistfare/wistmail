-- AI worker outputs: per-email summary + processed timestamp, AI-source
-- labels, multi-row reply suggestions, and the daily Today digest.

ALTER TABLE "emails" ADD COLUMN "auto_summary" text;--> statement-breakpoint
ALTER TABLE "emails" ADD COLUMN "ai_processed_at" timestamp with time zone;--> statement-breakpoint

ALTER TABLE "email_labels" ADD COLUMN "source" varchar(8) DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "email_labels" ADD COLUMN "confidence" real;--> statement-breakpoint

CREATE TABLE "email_reply_suggestions" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"email_id" varchar(64) NOT NULL,
	"tone" varchar(16) NOT NULL,
	"body" text NOT NULL,
	"score" real DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "today_digests" (
	"user_id" varchar(64) PRIMARY KEY NOT NULL,
	"content" jsonb NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "email_reply_suggestions" ADD CONSTRAINT "email_reply_suggestions_email_id_emails_id_fk" FOREIGN KEY ("email_id") REFERENCES "public"."emails"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "today_digests" ADD CONSTRAINT "today_digests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "email_reply_suggestions_email_idx" ON "email_reply_suggestions" USING btree ("email_id");--> statement-breakpoint
-- Worker idempotency probe: WHERE ai_processed_at IS NULL ORDER BY created_at.
CREATE INDEX "emails_ai_unprocessed_idx" ON "emails" ("created_at") WHERE "ai_processed_at" IS NULL;
