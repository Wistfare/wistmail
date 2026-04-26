-- Per-user IANA timezone, used by the AI worker to fire each user's
-- daily Today digest at their local 04:00 instead of one fixed wall time.
-- The mobile client sends the device TZ on every authenticated request
-- via X-Client-Timezone; the API persists it here when it changes.

ALTER TABLE "users" ADD COLUMN "timezone" varchar(64) DEFAULT 'UTC' NOT NULL;
