-- Idempotent: ensureSchema in apps/api/src/index.ts already adds these
-- columns + tables on prod boot via IF NOT EXISTS, so this migration
-- arrives at a partially-applied state. Per migrate.ts comment:
-- "If a later migration's DDL conflicts with what ensureSchema already
-- created, that migration must use IF NOT EXISTS / DO $$ guards."
ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "edited_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chat_message_reads" (
	"message_id" varchar(64) NOT NULL,
	"user_id" varchar(64) NOT NULL,
	"read_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_message_reads_pk" PRIMARY KEY("message_id","user_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "chat_message_reads" ADD CONSTRAINT "chat_message_reads_message_id_chat_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."chat_messages"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "chat_message_reads" ADD CONSTRAINT "chat_message_reads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_message_reads_user_id_idx" ON "chat_message_reads" USING btree ("user_id");
