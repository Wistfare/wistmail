import { serve } from '@hono/node-server'
import { sql } from 'drizzle-orm'
import { app } from './app.js'
import { getDb } from './lib/db.js'

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
      avatar_url text, setup_complete boolean NOT NULL DEFAULT false,
      setup_step varchar(20) DEFAULT 'domain',
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
    )`,
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
      size_bytes int NOT NULL DEFAULT 0, storage_key text NOT NULL
    )`,
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
    `CREATE TABLE IF NOT EXISTS org_credits (
      id varchar(64) PRIMARY KEY,
      org_id varchar(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE UNIQUE,
      balance bigint NOT NULL DEFAULT 100, total_purchased bigint NOT NULL DEFAULT 0,
      total_used bigint NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS credit_transactions (
      id varchar(64) PRIMARY KEY,
      org_id varchar(64) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      amount bigint NOT NULL, type varchar(30) NOT NULL,
      description text, email_id varchar(64),
      created_at timestamptz NOT NULL DEFAULT now()
    )`,
  ]

  for (const stmt of createStatements) {
    try {
      await db.execute(sql.raw(stmt))
    } catch (err) {
      // Only log non-"already exists" errors
      const errStr = String(err)
      if (!errStr.includes('already exists')) {
        console.error('Schema creation error:', errStr.substring(0, 200))
      }
    }
  }

  console.log('Database schema verified')
}

async function start() {
  await ensureSchema()

  serve({
    fetch: app.fetch,
    port,
  })

  console.log(`Wistfare Mail API running on http://localhost:${port}`)
}

start()
