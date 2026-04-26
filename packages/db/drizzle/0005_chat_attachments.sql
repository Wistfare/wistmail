-- Idempotent: ensureSchema in apps/api/src/index.ts already creates
-- this table on prod boot via IF NOT EXISTS. Same pattern as 0003.
CREATE TABLE IF NOT EXISTS "chat_attachments" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"message_id" varchar(64),
	"uploader_id" varchar(64) NOT NULL,
	"filename" varchar(255) NOT NULL,
	"content_type" varchar(127) NOT NULL,
	"size_bytes" integer NOT NULL,
	"storage_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "chat_attachments" ADD CONSTRAINT "chat_attachments_message_id_chat_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."chat_messages"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "chat_attachments" ADD CONSTRAINT "chat_attachments_uploader_id_users_id_fk" FOREIGN KEY ("uploader_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_attachments_message_id_idx" ON "chat_attachments" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_attachments_uploader_id_idx" ON "chat_attachments" USING btree ("uploader_id");
