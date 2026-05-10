-- 0010_chat_reactions.sql
--
-- Adds the per-message reactions column on `chat_messages`, used by
-- the V3 ChatViewV3 reactions popover (Pencil `mCFcx`).
--
-- Shape: jsonb { emoji -> [userId, …] }.  Defaults to `{}` so callers
-- never have to NULL-check, and so existing rows (no reactions yet)
-- behave the same as freshly-created messages.
--
-- Idempotent: ensureSchema in apps/api/src/index.ts ships the same
-- ADD COLUMN IF NOT EXISTS, so this migration must coexist with a
-- partially-applied state.

ALTER TABLE "chat_messages"
  ADD COLUMN IF NOT EXISTS "reactions" jsonb DEFAULT '{}'::jsonb NOT NULL;
