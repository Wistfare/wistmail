-- Cross-user cache of resolved display names for email addresses.
-- The AI display-name derivation runs once per unique sender address;
-- subsequent emails from the same sender hit this cache instantly.

CREATE TABLE "sender_names" (
	"address" varchar(255) PRIMARY KEY NOT NULL,
	"display_name" varchar(255) NOT NULL,
	"source" varchar(12) NOT NULL,
	"confidence" real,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "sender_names_source_idx" ON "sender_names" USING btree ("source");
