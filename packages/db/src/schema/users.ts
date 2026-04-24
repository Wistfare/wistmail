import { boolean, jsonb, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: varchar('id', { length: 64 }).primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  passwordHash: text('password_hash').notNull(),
  avatarUrl: text('avatar_url'),
  externalEmail: varchar('external_email', { length: 255 }),
  setupComplete: boolean('setup_complete').notNull().default(false),
  setupStep: varchar('setup_step', { length: 20 }).notNull().default('domain'),
  // MFA enrollment state. mfaRequired stays true even after setup so we can
  // tell "user has it enabled" from "user has not yet completed enrollment".
  mfaRequired: boolean('mfa_required').notNull().default(true),
  mfaSetupComplete: boolean('mfa_setup_complete').notNull().default(false),
  // Focus mode silences non-urgent notifications. When focusModeUntil is
  // in the future, the push fan-out drops mail/chat pings (calendar
  // reminders still come through).
  focusModeEnabled: boolean('focus_mode_enabled').notNull().default(false),
  focusModeUntil: timestamp('focus_mode_until', { withTimezone: true }),
  // Channel-level notification prefs: { mail: bool, chat: bool, calendar: bool }
  notificationPrefs: jsonb('notification_prefs')
    .$type<{ mail?: boolean; chat?: boolean; calendar?: boolean }>()
    .notNull()
    .default({ mail: true, chat: true, calendar: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const passwordResetTokens = pgTable('password_reset_tokens', {
  id: varchar('id', { length: 64 }).primaryKey(),
  userId: varchar('user_id', { length: 64 }).notNull(),
  tokenHash: varchar('token_hash', { length: 128 }).notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
