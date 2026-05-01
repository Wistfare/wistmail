-- AI-extracted meetings auto-create calendar_events rows linked back
-- to the source email. Two-way pointer keeps the relationship
-- queryable in either direction (e.g. "what email created this
-- event?" + "did this email already produce an event?").

ALTER TABLE "emails" ADD COLUMN "meeting_extracted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "emails" ADD COLUMN "meeting_event_id" varchar(64);--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN "source" varchar(8) DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN "source_email_id" varchar(64);--> statement-breakpoint
CREATE INDEX "calendar_events_source_email_idx" ON "calendar_events" USING btree ("source_email_id") WHERE "source_email_id" IS NOT NULL;
