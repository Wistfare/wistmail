import { pgTable, text, timestamp, varchar, integer } from 'drizzle-orm/pg-core'
import { users } from './users'

/// One row per MFA factor a user has set up.
///
///   type     — 'totp' | 'email' | 'backup_codes' (singleton bucket per user)
///   secret   — Encrypted secret material (TOTP base32 secret, or email
///              recovery address). Encrypted at rest with AES-256-GCM
///              using MFA_SECRETS_KEY; format is `iv:authTag:ciphertext`,
///              all base64.
///   label    — Optional display label, e.g. "iPhone 15 Pro" or
///              "Personal Gmail".
///   verified — false until the user proves they hold the factor by
///              entering a valid code at setup time. Unverified rows
///              are pruned by /mfa/methods endpoints.
export const mfaMethods = pgTable('mfa_methods', {
  id: varchar('id', { length: 64 }).primaryKey(),
  userId: varchar('user_id', { length: 64 })
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 20 }).notNull(),
  secretEncrypted: text('secret_encrypted').notNull(),
  label: varchar('label', { length: 120 }),
  verified: text('verified').notNull().default('false'),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

/// Recovery codes generated when TOTP is set up. Stored as SHA-256 hashes;
/// raw codes are shown to the user once at generation time.
export const mfaBackupCodes = pgTable('mfa_backup_codes', {
  id: varchar('id', { length: 64 }).primaryKey(),
  userId: varchar('user_id', { length: 64 })
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  codeHash: varchar('code_hash', { length: 128 }).notNull().unique(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

/// Short-lived bearer issued after step 1 of a 2-step login (correct
/// password) to authorize step 2 (MFA code). Holding this token does NOT
/// grant a session — only the right to attempt MFA verification.
export const mfaPendingLogins = pgTable('mfa_pending_logins', {
  id: varchar('id', { length: 64 }).primaryKey(),
  tokenHash: varchar('token_hash', { length: 128 }).notNull().unique(),
  userId: varchar('user_id', { length: 64 })
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  attempts: integer('attempts').notNull().default(0),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

/// One-time codes for email-based MFA setup verification AND for email-as-
/// second-factor login challenges. SHA-256 hashed.
export const mfaEmailCodes = pgTable('mfa_email_codes', {
  id: varchar('id', { length: 64 }).primaryKey(),
  userId: varchar('user_id', { length: 64 })
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  purpose: varchar('purpose', { length: 20 }).notNull(),
  codeHash: varchar('code_hash', { length: 128 }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
