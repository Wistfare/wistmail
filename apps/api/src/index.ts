import { serve } from '@hono/node-server'
import { sql } from 'drizzle-orm'
import { seedSystemData } from '@wistmail/db'
import { app } from './app.js'
import { getDb } from './lib/db.js'
import { attachWebSocketServer } from './ws/server.js'
import { startSendDispatcher } from './services/send-dispatcher.js'
import { startTrashRetention } from './services/trash-retention.js'
import { startChatAttachmentCleanup } from './services/chat-attachment-cleanup.js'
import { startCacheBus } from './lib/cache-bus.js'
import { startNotificationUpdateBus } from './lib/notification-update-bus.js'

const port = parseInt(process.env.API_PORT || '3001', 10)

async function ensureSchema() {
  const db = getDb()

  // Create tables if they don't exist using IF NOT EXISTS
  // This is safer than Drizzle's file-based migrator for Docker deployments
  // where migration filenames can change between builds
  const createStatements = [
    `CREATE TABLE IF NOT EXISTS users (
      id varchar(64) PRIMARY KEY, email varchar(255) NOT NULL UNIQUE,
      name varchar(255) NOT NULL, password_hash text NOT NULL,
      avatar_url text, external_email varchar(255),
      setup_complete boolean NOT NULL DEFAULT false,
      setup_step varchar(20) DEFAULT 'domain',
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
    )`,
    // Idempotent column adds for users created before these features.
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS external_email varchar(255)`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_required boolean NOT NULL DEFAULT true`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_setup_complete boolean NOT NULL DEFAULT false`,
    // MobileV3 Me screen — focus mode + per-channel notification prefs.
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS focus_mode_enabled boolean NOT NULL DEFAULT false`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS focus_mode_until timestamptz`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_prefs jsonb NOT NULL DEFAULT '{"mail":true,"chat":true,"calendar":true}'::jsonb`,
    `CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id varchar(64) PRIMARY KEY,
      user_id varchar(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash varchar(128) NOT NULL UNIQUE,
      expires_at timestamptz NOT NULL,
      used_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS mfa_methods (
      id varchar(64) PRIMARY KEY,
      user_id varchar(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type varchar(20) NOT NULL,
      secret_encrypted text NOT NULL,
      label varchar(120),
      verified text NOT NULL DEFAULT 'false',
      last_used_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE INDEX IF NOT EXISTS mfa_methods_user_idx ON mfa_methods(user_id)`,
    `CREATE TABLE IF NOT EXISTS mfa_backup_codes (
      id varchar(64) PRIMARY KEY,
      user_id varchar(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      code_hash varchar(128) NOT NULL UNIQUE,
      used_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE INDEX IF NOT EXISTS mfa_backup_codes_user_idx ON mfa_backup_codes(user_id)`,
    `CREATE TABLE IF NOT EXISTS mfa_pending_logins (
      id varchar(64) PRIMARY KEY,
      token_hash varchar(128) NOT NULL UNIQUE,
      user_id varchar(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      attempts integer NOT NULL DEFAULT 0,
      expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS mfa_email_codes (
      id varchar(64) PRIMARY KEY,
      user_id varchar(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      purpose varchar(20) NOT NULL,
      code_hash varchar(128) NOT NULL,
      expires_at timestamptz NOT NULL,
      consumed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE INDEX IF NOT EXISTS mfa_email_codes_user_idx ON mfa_email_codes(user_id, purpose)`,
    `CREATE TABLE IF NOT EXISTS domains (
      id varchar(64) PRIMARY KEY, name varchar(255) NOT NULL UNIQUE,
      user_id varchar(64) REFERENCES users(id) ON DELETE CASCADE,
      verified boolean NOT NULL DEFAULT false, status varchar(20) NOT NULL DEFAULT 'pending',
      dkim_public_key text, dkim_private_key text,
      dkim_selector varchar(63) NOT NULL DEFAULT 'wistmail',
      spf_record text, dmarc_record text,
      mx_verified boolean NOT NULL DEFAULT false, spf_verified boolean NOT NULL DEFAULT false,
      dkim_verified boolean NOT NULL DEFAULT false, dmarc_verified boolean NOT NULL DEFAULT false,
      dns_provider varchar(20) NOT NULL DEFAULT 'manual',
      cloudflare_zone_id varchar(64), server_ip varchar(45),
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS organizations (
      id varchar(64) PRIMARY KEY, name varchar(255) NOT NULL,
      slug varchar(255) NOT NULL UNIQUE, owner_id varchar(64) REFERENCES users(id) ON DELETE CASCADE,
      logo_url text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS org_members (
      id varchar(64) PRIMARY KEY, org_id varchar(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      user_id varchar(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role varchar(20) NOT NULL DEFAULT 'member', created_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS mailboxes (
      id varchar(64) PRIMARY KEY, address varchar(255) NOT NULL UNIQUE,
      display_name varchar(255) NOT NULL, domain_id varchar(64) NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
      user_id varchar(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      quota_bytes bigint NOT NULL DEFAULT 5368709120, used_bytes bigint NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS sessions (
      id varchar(64) PRIMARY KEY, user_id varchar(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token text NOT NULL UNIQUE, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS setup_tokens (
      id varchar(64) PRIMARY KEY, token text NOT NULL UNIQUE,
      domain_id varchar(64) REFERENCES domains(id) ON DELETE CASCADE,
      step varchar(20) NOT NULL DEFAULT 'domain', expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS threads (
      id varchar(64) PRIMARY KEY, subject text NOT NULL,
      last_email_at timestamptz NOT NULL, mailbox_id varchar(64) NOT NULL REFERENCES mailboxes(id) ON DELETE CASCADE,
      participant_addresses jsonb NOT NULL DEFAULT '[]', email_count int NOT NULL DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS emails (
      id varchar(64) PRIMARY KEY, message_id text NOT NULL,
      from_address varchar(255) NOT NULL, to_addresses jsonb NOT NULL DEFAULT '[]',
      cc jsonb DEFAULT '[]', bcc jsonb DEFAULT '[]',
      subject text NOT NULL DEFAULT '', text_body text, html_body text,
      mailbox_id varchar(64) NOT NULL REFERENCES mailboxes(id) ON DELETE CASCADE,
      folder varchar(20) NOT NULL DEFAULT 'inbox',
      is_read boolean NOT NULL DEFAULT false, is_starred boolean NOT NULL DEFAULT false,
      is_draft boolean NOT NULL DEFAULT false,
      thread_id varchar(64) REFERENCES threads(id) ON DELETE SET NULL,
      in_reply_to text, "references" jsonb DEFAULT '[]',
      headers jsonb NOT NULL DEFAULT '{}',
      size_bytes int NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS attachments (
      id varchar(64) PRIMARY KEY, email_id varchar(64) NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
      filename varchar(255) NOT NULL, content_type varchar(255) NOT NULL,
      content_id varchar(255),
      size_bytes int NOT NULL DEFAULT 0, storage_key text NOT NULL
    )`,
    // RSVP state on calendar invite attachments (null for everything
    // else). Lets the client render "You accepted this" without a
    // second round trip and blocks double-RSVPs.
    `ALTER TABLE attachments ADD COLUMN IF NOT EXISTS content_id varchar(255)`,
    `ALTER TABLE attachments ADD COLUMN IF NOT EXISTS rsvp_response varchar(16)`,
    `ALTER TABLE attachments ADD COLUMN IF NOT EXISTS rsvp_responded_at timestamptz`,
    // Idempotent column adds for the drafts-as-outbox lifecycle
    // (status / sendError / sendAttempts / lastAttemptAt / updatedAt).
    `ALTER TABLE emails ADD COLUMN IF NOT EXISTS status varchar(16) NOT NULL DEFAULT 'idle'`,
    `ALTER TABLE emails ADD COLUMN IF NOT EXISTS send_error text`,
    `ALTER TABLE emails ADD COLUMN IF NOT EXISTS send_attempts int NOT NULL DEFAULT 0`,
    `ALTER TABLE emails ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz`,
    `ALTER TABLE emails ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()`,
    `ALTER TABLE emails ADD COLUMN IF NOT EXISTS snooze_until timestamptz`,
    `ALTER TABLE emails ADD COLUMN IF NOT EXISTS scheduled_at timestamptz`,
    // AI-derived "needs reply" flag powering Today screen's Needs Reply feed.
    `ALTER TABLE emails ADD COLUMN IF NOT EXISTS needs_reply boolean`,
    `ALTER TABLE emails ADD COLUMN IF NOT EXISTS needs_reply_reason text`,
    `CREATE INDEX IF NOT EXISTS emails_needs_reply_idx ON emails(mailbox_id, created_at DESC) WHERE needs_reply = true`,
    // Threading: the `threads` table + `thread_id` FK were declared
    // inside the CREATE TABLE block above, but a production DB with
    // an existing `emails` table treats that CREATE as a no-op so
    // the column never gets added. Without this ALTER the new
    // email-receiver code writes `thread_id: <id>` into an INSERT
    // that silently fails — inbound messages are lost.
    `ALTER TABLE emails ADD COLUMN IF NOT EXISTS thread_id varchar(64)`,
    // FK is added in a separate statement so the ALTER can land
    // even if the threads table hasn't been created yet on some
    // older deployment. Safe to run repeatedly because of the
    // IF NOT EXISTS guard on the constraint name.
    `DO $$
     BEGIN
       IF NOT EXISTS (
         SELECT 1 FROM pg_constraint
         WHERE conname = 'emails_thread_id_fkey'
       ) THEN
         ALTER TABLE emails
           ADD CONSTRAINT emails_thread_id_fkey
           FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE SET NULL;
       END IF;
     END
     $$;`,
    `CREATE INDEX IF NOT EXISTS emails_status_idx ON emails(status) WHERE status IN ('sending','rate_limited','failed')`,
    // Synthetic folder support — partial indexes for hot reads.
    `CREATE INDEX IF NOT EXISTS emails_snooze_until_idx ON emails(snooze_until) WHERE snooze_until IS NOT NULL`,
    `CREATE INDEX IF NOT EXISTS emails_scheduled_at_idx ON emails(scheduled_at) WHERE scheduled_at IS NOT NULL`,
    `CREATE INDEX IF NOT EXISTS emails_starred_idx ON emails(mailbox_id, created_at DESC) WHERE is_starred = true`,
    `CREATE INDEX IF NOT EXISTS emails_thread_id_idx ON emails(thread_id) WHERE thread_id IS NOT NULL`,
    `CREATE TABLE IF NOT EXISTS labels (
      id varchar(64) PRIMARY KEY, name varchar(255) NOT NULL,
      color varchar(7) NOT NULL DEFAULT '#999999',
      mailbox_id varchar(64) NOT NULL REFERENCES mailboxes(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS email_labels (
      email_id varchar(64) NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
      label_id varchar(64) NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
      PRIMARY KEY (email_id, label_id)
    )`,
    `CREATE TABLE IF NOT EXISTS contacts (
      id varchar(64) PRIMARY KEY, email varchar(255) NOT NULL,
      name varchar(255), user_id varchar(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      metadata jsonb NOT NULL DEFAULT '{}',
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS api_keys (
      id varchar(64) PRIMARY KEY, key_hash varchar(128) NOT NULL UNIQUE,
      key_prefix varchar(10) NOT NULL, name varchar(255) NOT NULL,
      scopes jsonb NOT NULL DEFAULT '[]',
      domain_id varchar(64) REFERENCES domains(id) ON DELETE SET NULL,
      user_id varchar(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      last_used_at timestamptz, expires_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS webhooks (
      id varchar(64) PRIMARY KEY, url text NOT NULL,
      events jsonb NOT NULL DEFAULT '[]', secret text NOT NULL,
      domain_id varchar(64) REFERENCES domains(id) ON DELETE SET NULL,
      user_id varchar(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS webhook_logs (
      id varchar(64) PRIMARY KEY, webhook_id varchar(64) NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
      event varchar(50) NOT NULL, payload jsonb NOT NULL DEFAULT '{}',
      response_status int, attempts int NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS templates (
      id varchar(64) PRIMARY KEY, name varchar(255) NOT NULL,
      subject text NOT NULL, html text NOT NULL,
      variables jsonb NOT NULL DEFAULT '[]',
      user_id varchar(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS sending_logs (
      id varchar(64) PRIMARY KEY, email_id varchar(64) NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
      api_key_id varchar(64), status varchar(20) NOT NULL DEFAULT 'queued',
      opened_at timestamptz, clicked_at timestamptz, bounced_at timestamptz, delivered_at timestamptz,
      metadata jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS audiences (
      id varchar(64) PRIMARY KEY, name varchar(255) NOT NULL,
      user_id varchar(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      contact_count int NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS audience_contacts (
      id varchar(64) PRIMARY KEY, audience_id varchar(64) NOT NULL REFERENCES audiences(id) ON DELETE CASCADE,
      contact_id varchar(64) NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      subscribed_at timestamptz NOT NULL DEFAULT now(), unsubscribed_at timestamptz,
      topics jsonb NOT NULL DEFAULT '[]'
    )`,
    `CREATE TABLE IF NOT EXISTS audit_logs (
      id varchar(64) PRIMARY KEY,
      user_id varchar(64) REFERENCES users(id) ON DELETE SET NULL,
      action varchar(100) NOT NULL, resource varchar(100) NOT NULL,
      resource_id varchar(64) NOT NULL, details jsonb NOT NULL DEFAULT '{}',
      ip_address varchar(45), user_agent text,
      created_at timestamptz NOT NULL DEFAULT now()
    )`,
    // Note: org_credits and credit_transactions tables exist in prod from
    // an earlier billing model; we no longer write to them. The legacy
    // tables stay so we don't ALTER + lose any historical rows. Drop in
    // a future migration once we're confident nothing references them.
    `CREATE TABLE IF NOT EXISTS device_tokens (
      id varchar(64) PRIMARY KEY,
      user_id varchar(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token text NOT NULL UNIQUE,
      platform varchar(16) NOT NULL,
      locale varchar(16),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS conversations (
      id varchar(64) PRIMARY KEY,
      kind varchar(16) NOT NULL DEFAULT 'direct',
      title varchar(255),
      created_by varchar(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      last_message_at timestamptz NOT NULL DEFAULT now(),
      created_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS conversation_participants (
      conversation_id varchar(64) NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      user_id varchar(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      last_read_at timestamptz,
      unread_count integer NOT NULL DEFAULT 0,
      joined_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (conversation_id, user_id)
    )`,
    `CREATE TABLE IF NOT EXISTS chat_messages (
      id varchar(64) PRIMARY KEY,
      conversation_id varchar(64) NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      sender_id varchar(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )`,
    // Phase 3 — message lifecycle. Idempotent column adds for legacy DBs.
    `ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS edited_at timestamptz`,
    `ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS deleted_at timestamptz`,
    // Phase H.B — per-message reactions. JSONB { emoji -> [userId, …] }.
    `ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS reactions jsonb NOT NULL DEFAULT '{}'::jsonb`,
    `CREATE TABLE IF NOT EXISTS chat_message_reads (
      message_id varchar(64) NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
      user_id varchar(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      read_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (message_id, user_id)
    )`,
    `CREATE INDEX IF NOT EXISTS chat_message_reads_user_id_idx ON chat_message_reads(user_id)`,
    // Phase 4 — chat attachments. Two-step upload: orphan rows have
    // null message_id; the send route claims them by stamping it.
    `CREATE TABLE IF NOT EXISTS chat_attachments (
      id varchar(64) PRIMARY KEY,
      message_id varchar(64) REFERENCES chat_messages(id) ON DELETE CASCADE,
      uploader_id varchar(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      filename varchar(255) NOT NULL,
      content_type varchar(127) NOT NULL,
      size_bytes integer NOT NULL,
      storage_key text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE INDEX IF NOT EXISTS chat_attachments_message_id_idx ON chat_attachments(message_id)`,
    `CREATE INDEX IF NOT EXISTS chat_attachments_uploader_id_idx ON chat_attachments(uploader_id)`,
    `CREATE TABLE IF NOT EXISTS calendar_events (
      id varchar(64) PRIMARY KEY,
      user_id varchar(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title varchar(255) NOT NULL,
      description text,
      location varchar(255),
      attendees jsonb NOT NULL DEFAULT '[]',
      start_at timestamptz NOT NULL,
      end_at timestamptz NOT NULL,
      color varchar(7) NOT NULL DEFAULT '#C5F135',
      meeting_link text,
      has_waiting_room boolean NOT NULL DEFAULT false,
      reminder_minutes jsonb NOT NULL DEFAULT '[15]',
      notes text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS projects (
      id varchar(64) PRIMARY KEY,
      owner_id varchar(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name varchar(255) NOT NULL,
      description text,
      status varchar(20) NOT NULL DEFAULT 'active',
      progress integer NOT NULL DEFAULT 0,
      member_user_ids jsonb NOT NULL DEFAULT '[]',
      due_date timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`,
    // Project tasks — drive the project progress bar on the Work screen.
    // A project's computed progress = done / total * 100; the projects.progress
    // column is kept as a denormalized cache.
    `CREATE TABLE IF NOT EXISTS project_tasks (
      id varchar(64) PRIMARY KEY,
      project_id varchar(64) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      title varchar(500) NOT NULL,
      status varchar(20) NOT NULL DEFAULT 'todo',
      assignee_id varchar(64) REFERENCES users(id) ON DELETE SET NULL,
      due_date timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE INDEX IF NOT EXISTS project_tasks_project_idx ON project_tasks(project_id)`,
    `CREATE INDEX IF NOT EXISTS project_tasks_assignee_idx ON project_tasks(assignee_id) WHERE assignee_id IS NOT NULL`,
    // Docs — V3 docs feature. The "Recent docs" block on the Work
    // screen reads the same table; the editor at /docs/[id] reads/writes
    // the body column. The body field was added later — the ALTER below
    // is the migration path for environments created before phase 8.
    `CREATE TABLE IF NOT EXISTS docs (
      id varchar(64) PRIMARY KEY,
      owner_id varchar(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      project_id varchar(64) REFERENCES projects(id) ON DELETE SET NULL,
      title varchar(500) NOT NULL,
      icon varchar(32),
      body text,
      updated_at timestamptz NOT NULL DEFAULT now(),
      created_at timestamptz NOT NULL DEFAULT now()
    )`,
    `ALTER TABLE docs ADD COLUMN IF NOT EXISTS body text`,
    `ALTER TABLE docs ADD COLUMN IF NOT EXISTS status varchar(20) NOT NULL DEFAULT 'draft'`,
    `ALTER TABLE docs ADD COLUMN IF NOT EXISTS share_token varchar(64)`,
    `CREATE INDEX IF NOT EXISTS docs_owner_updated_idx ON docs(owner_id, updated_at DESC)`,
    `CREATE INDEX IF NOT EXISTS docs_share_token_idx ON docs(share_token) WHERE share_token IS NOT NULL`,
    // Doc comments — Phase 8 right-rail comments thread on DocsV3-Editor.
    `CREATE TABLE IF NOT EXISTS doc_comments (
      id varchar(64) PRIMARY KEY,
      doc_id varchar(64) NOT NULL REFERENCES docs(id) ON DELETE CASCADE,
      author_id varchar(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      deleted_at timestamptz
    )`,
    `CREATE INDEX IF NOT EXISTS doc_comments_doc_created_idx ON doc_comments(doc_id, created_at)`,
    // ── Hot-path indexes (idempotent). Every authenticated request resolves
    // the user's mailboxes; every inbox open paginates emails by folder.
    `CREATE INDEX IF NOT EXISTS mailboxes_user_id_idx ON mailboxes(user_id)`,
    `CREATE INDEX IF NOT EXISTS mailboxes_domain_id_idx ON mailboxes(domain_id)`,
    `CREATE INDEX IF NOT EXISTS emails_mailbox_folder_created_idx ON emails(mailbox_id, folder, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS emails_mailbox_unread_folder_idx ON emails(mailbox_id, is_read, folder)`,
    `CREATE INDEX IF NOT EXISTS org_members_user_id_idx ON org_members(user_id)`,
    `CREATE INDEX IF NOT EXISTS org_members_org_id_idx ON org_members(org_id)`,
    `CREATE INDEX IF NOT EXISTS sessions_token_idx ON sessions(token)`,
    `CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id)`,
    `CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at)`,
    `CREATE INDEX IF NOT EXISTS conversation_participants_user_idx ON conversation_participants(user_id)`,
    `CREATE INDEX IF NOT EXISTS chat_messages_conv_created_idx ON chat_messages(conversation_id, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS device_tokens_user_idx ON device_tokens(user_id)`,
    `CREATE INDEX IF NOT EXISTS audit_logs_user_created_idx ON audit_logs(user_id, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS calendar_events_user_start_idx ON calendar_events(user_id, start_at)`,
    // ── Per-user IANA timezone (drives the AI digest's local 04:00).
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone varchar(64) NOT NULL DEFAULT 'UTC'`,
    // ── Display name from the inbound email's RFC-5322 From header.
    `ALTER TABLE emails ADD COLUMN IF NOT EXISTS from_name varchar(255)`,
    // ── Cross-user cache of resolved sender display names. Keeps the
    // AI display-name derivation to one model call per unique sender.
    `CREATE TABLE IF NOT EXISTS sender_names (
      address varchar(255) PRIMARY KEY,
      display_name varchar(255) NOT NULL,
      source varchar(12) NOT NULL,
      confidence real,
      updated_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE INDEX IF NOT EXISTS sender_names_source_idx ON sender_names(source)`,
    // ── AI worker outputs.
    `ALTER TABLE emails ADD COLUMN IF NOT EXISTS auto_summary text`,
    `ALTER TABLE emails ADD COLUMN IF NOT EXISTS ai_processed_at timestamptz`,
    `CREATE INDEX IF NOT EXISTS emails_ai_unprocessed_idx ON emails(created_at) WHERE ai_processed_at IS NULL`,
    `ALTER TABLE email_labels ADD COLUMN IF NOT EXISTS source varchar(8) NOT NULL DEFAULT 'user'`,
    `ALTER TABLE email_labels ADD COLUMN IF NOT EXISTS confidence real`,
    `CREATE TABLE IF NOT EXISTS email_reply_suggestions (
      id varchar(64) PRIMARY KEY,
      email_id varchar(64) NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
      tone varchar(16) NOT NULL,
      body text NOT NULL,
      score real NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE INDEX IF NOT EXISTS email_reply_suggestions_email_idx ON email_reply_suggestions(email_id)`,
    `CREATE TABLE IF NOT EXISTS today_digests (
      user_id varchar(64) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      content jsonb NOT NULL,
      generated_at timestamptz NOT NULL DEFAULT now()
    )`,
    // ── Billing: plans + plan_features (mirrors drizzle 0008).
    `CREATE TABLE IF NOT EXISTS plans (
      id varchar(64) PRIMARY KEY,
      code varchar(64) NOT NULL,
      name varchar(128) NOT NULL,
      description text,
      per_seat_cents int NOT NULL,
      included_storage_mb_per_seat int NOT NULL DEFAULT 1024,
      trial_days int NOT NULL DEFAULT 7,
      grace_period_days int NOT NULL DEFAULT 7,
      currency varchar(8) NOT NULL DEFAULT 'USD',
      active boolean NOT NULL DEFAULT true,
      sort_order int NOT NULL DEFAULT 100,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS plans_code_uidx ON plans(code)`,
    `CREATE TABLE IF NOT EXISTS plan_features (
      id varchar(64) PRIMARY KEY,
      plan_id varchar(64) NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
      key varchar(128) NOT NULL,
      value jsonb,
      label varchar(255),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS plan_features_plan_key_uidx ON plan_features(plan_id, key)`,
    `CREATE INDEX IF NOT EXISTS plan_features_plan_idx ON plan_features(plan_id)`,
    // ── RBAC: roles + role_permissions + org_role_assignments (mirrors drizzle 0008).
    `CREATE TABLE IF NOT EXISTS roles (
      id varchar(64) PRIMARY KEY,
      code varchar(64) NOT NULL,
      name varchar(128) NOT NULL,
      description text,
      org_id varchar(64) REFERENCES organizations(id) ON DELETE CASCADE,
      is_system boolean NOT NULL DEFAULT false,
      level int NOT NULL DEFAULT 10,
      grants_admin_access boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS roles_system_code_uidx ON roles(code) WHERE org_id IS NULL`,
    `CREATE UNIQUE INDEX IF NOT EXISTS roles_org_code_uidx ON roles(org_id, code) WHERE org_id IS NOT NULL`,
    `CREATE INDEX IF NOT EXISTS roles_org_idx ON roles(org_id)`,
    `CREATE TABLE IF NOT EXISTS role_permissions (
      id varchar(64) PRIMARY KEY,
      role_id varchar(64) NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      permission varchar(128) NOT NULL,
      constraints jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS role_permissions_uidx ON role_permissions(role_id, permission)`,
    `CREATE INDEX IF NOT EXISTS role_permissions_role_idx ON role_permissions(role_id)`,
    `CREATE TABLE IF NOT EXISTS org_role_assignments (
      id varchar(64) PRIMARY KEY,
      org_id varchar(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      user_id varchar(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role_id varchar(64) NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
      assigned_by varchar(64) REFERENCES users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS org_role_assignments_uidx ON org_role_assignments(org_id, user_id, role_id)`,
    `CREATE INDEX IF NOT EXISTS org_role_assignments_org_user_idx ON org_role_assignments(org_id, user_id)`,
    `CREATE INDEX IF NOT EXISTS org_role_assignments_role_idx ON org_role_assignments(role_id)`,
    // ── Billing runtime: wallets + subscriptions + ledger + collection attempts (mirrors drizzle 0009).
    `CREATE TABLE IF NOT EXISTS wallets (
      id varchar(64) PRIMARY KEY,
      org_id varchar(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      balance_cents bigint NOT NULL DEFAULT 0,
      currency varchar(8) NOT NULL DEFAULT 'USD',
      frozen boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS wallets_org_uidx ON wallets(org_id)`,
    `CREATE TABLE IF NOT EXISTS subscriptions (
      id varchar(64) PRIMARY KEY,
      org_id varchar(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      plan_id varchar(64) NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
      status varchar(24) NOT NULL DEFAULT 'trial',
      seats int NOT NULL DEFAULT 1,
      trial_started_at timestamptz,
      trial_ends_at timestamptz,
      current_period_start timestamptz,
      current_period_end timestamptz,
      grace_ends_at timestamptz,
      cancelled_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_org_active_uidx ON subscriptions(org_id) WHERE status <> 'cancelled'`,
    `CREATE INDEX IF NOT EXISTS subscriptions_status_idx ON subscriptions(status)`,
    `CREATE INDEX IF NOT EXISTS subscriptions_period_end_idx ON subscriptions(current_period_end)`,
    `CREATE TABLE IF NOT EXISTS wallet_transactions (
      id varchar(64) PRIMARY KEY,
      wallet_id varchar(64) NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
      org_id varchar(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      amount_cents bigint NOT NULL,
      balance_after_cents bigint NOT NULL,
      reason varchar(32) NOT NULL,
      provider varchar(32),
      provider_ref varchar(128),
      subscription_id varchar(64),
      note text,
      metadata jsonb,
      initiated_by varchar(64) REFERENCES users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE INDEX IF NOT EXISTS wallet_transactions_wallet_idx ON wallet_transactions(wallet_id, created_at)`,
    `CREATE INDEX IF NOT EXISTS wallet_transactions_org_idx ON wallet_transactions(org_id, created_at)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS wallet_transactions_provider_ref_uidx ON wallet_transactions(provider, provider_ref) WHERE provider IS NOT NULL AND provider_ref IS NOT NULL`,
    `CREATE TABLE IF NOT EXISTS collection_attempts (
      id varchar(64) PRIMARY KEY,
      org_id varchar(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      initiated_by varchar(64) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      idempotency_key varchar(128) NOT NULL,
      provider_collection_id varchar(128),
      method varchar(24) NOT NULL,
      msisdn varchar(32) NOT NULL,
      amount_cents bigint NOT NULL,
      display_amount bigint,
      display_currency varchar(8),
      status varchar(24) NOT NULL DEFAULT 'pending',
      failure_reason text,
      request_payload jsonb,
      last_webhook_payload jsonb,
      completed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS collection_attempts_idem_uidx ON collection_attempts(idempotency_key)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS collection_attempts_provider_uidx ON collection_attempts(provider_collection_id) WHERE provider_collection_id IS NOT NULL`,
    `CREATE INDEX IF NOT EXISTS collection_attempts_org_idx ON collection_attempts(org_id, created_at)`,
    `CREATE INDEX IF NOT EXISTS collection_attempts_status_idx ON collection_attempts(status)`,
  ]

  for (const stmt of createStatements) {
    try {
      await db.execute(sql.raw(stmt))
    } catch (err) {
      const errStr = String(err)
      if (!errStr.includes('already exists')) {
        console.error('Schema creation error:', errStr.substring(0, 200))
      }
    }
  }

  console.log('Database schema verified')

  // Seed system data (idempotent: ON CONFLICT DO NOTHING). Skip with
  // DISABLE_SEED=1 — useful when shaving cold-start time on a known-seeded DB.
  if (!process.env.DISABLE_SEED) {
    try {
      await seedSystemData(db as never)
      console.log('System seed data verified')
    } catch (err) {
      console.error('Seed error (non-fatal, continuing):', String(err).substring(0, 200))
    }
  }
}

async function start() {
  // Greenfield installs that apply schema via `drizzle-kit migrate`
  // set DISABLE_ENSURE_SCHEMA=1 to skip the legacy hand-maintained
  // CREATE path. See packages/db/MIGRATIONS.md.
  if (process.env.DISABLE_ENSURE_SCHEMA !== '1') {
    await ensureSchema()
  } else {
    console.log('[schema] DISABLE_ENSURE_SCHEMA=1 — trusting drizzle migrations')
  }

  const server = serve({
    fetch: app.fetch,
    port,
  })

  attachWebSocketServer(server as unknown as import('node:http').Server)

  // Background tick that picks up rate_limited sends and retries them
  // when their backoff window has elapsed. Idempotent — claim() locks
  // each row so multiple processes can run safely.
  startSendDispatcher(getDb())

  // Hourly sweep of Trash: hard-delete emails that have been sitting
  // there longer than TRASH_RETENTION_DAYS (30 by default) and free
  // their attachments from disk. Skipped when DISABLE_TRASH_PURGE is
  // set so CI / local dev can keep old rows around for inspection.
  if (process.env.DISABLE_TRASH_PURGE !== '1') {
    startTrashRetention(getDb())
  }

  // Cross-process cache invalidation. The AI worker publishes after
  // writing classify/label/draft results so the API's hot-read cache
  // (today / unified-inbox / me-stats) refreshes without waiting for TTL.
  startCacheBus()

  // Cross-process notification updates. The AI worker publishes after
  // a `draft-reply` job completes so this process can fire a follow-up
  // FCM push that updates the existing email notification with reply
  // suggestion chips.
  startNotificationUpdateBus()

  // Hourly sweep of orphan chat attachments — uploads that were
  // staged but never claimed by a `sendMessage`. Bytes + DB row
  // gone after 24h. Skipped under the same flag as trash purge so
  // dev/CI doesn't reap fixtures unexpectedly.
  if (process.env.DISABLE_TRASH_PURGE !== '1') {
    startChatAttachmentCleanup(getDb())
  }

  console.log(`Wistfare Mail API running on http://localhost:${port}`)
  console.log(`WebSocket stream at ws://localhost:${port}/api/v1/stream`)
}

start()
