-- Idempotent: ensureSchema in apps/api/src/index.ts is the source of
-- truth on prod boot. Same pattern as 0003 / 0005 / 0007 — `IF NOT
-- EXISTS` on tables/columns/indexes, `DO $$ ... EXCEPTION` on
-- constraints so re-running can never fail.

ALTER TABLE "calendar_events"
  ADD COLUMN IF NOT EXISTS "source_email_id" varchar(64);
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "calendar_events"
   ADD CONSTRAINT "calendar_events_source_email_id_emails_id_fk"
   FOREIGN KEY ("source_email_id") REFERENCES "public"."emails"("id")
   ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "calendar_events_source_email_id_idx"
  ON "calendar_events" USING btree ("source_email_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "email_event_extractions" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "email_id" varchar(64) NOT NULL UNIQUE,
  "has_meeting" boolean NOT NULL,
  "title" varchar(255),
  "start_at" timestamp with time zone,
  "end_at" timestamp with time zone,
  "location" varchar(500),
  "attendees" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "confidence" real NOT NULL,
  "outcome" integer DEFAULT 0 NOT NULL,
  "created_event_id" varchar(64),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "email_event_extractions"
   ADD CONSTRAINT "email_event_extractions_email_id_emails_id_fk"
   FOREIGN KEY ("email_id") REFERENCES "public"."emails"("id")
   ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "email_event_extractions"
   ADD CONSTRAINT "email_event_extractions_created_event_id_calendar_events_id_fk"
   FOREIGN KEY ("created_event_id") REFERENCES "public"."calendar_events"("id")
   ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
