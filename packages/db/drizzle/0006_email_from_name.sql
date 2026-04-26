-- Display name from the inbound email's RFC-5322 From header.
-- Mailparser already extracts both name + address; the new code
-- persists name in this column. The mobile inbox/today rows render
-- fromName when set, falling back to the local-part of fromAddress.
-- Backfill for rows older than this migration is in
-- `apps/api/src/scripts/backfill-from-name.ts`.

ALTER TABLE "emails" ADD COLUMN "from_name" varchar(255);
