import { boolean, integer, jsonb, pgTable, text, timestamp, varchar, index } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { mailboxes } from './mailboxes'

export const threads = pgTable(
  'threads',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    subject: text('subject').notNull(),
    lastEmailAt: timestamp('last_email_at', { withTimezone: true }).notNull(),
    mailboxId: varchar('mailbox_id', { length: 64 })
      .notNull()
      .references(() => mailboxes.id, { onDelete: 'cascade' }),
    participantAddresses: jsonb('participant_addresses').$type<string[]>().notNull().default([]),
    emailCount: integer('email_count').notNull().default(0),
  },
  (table) => [
    index('threads_mailbox_id_idx').on(table.mailboxId),
    index('threads_last_email_at_idx').on(table.lastEmailAt),
  ],
)

export const emails = pgTable(
  'emails',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    messageId: varchar('message_id', { length: 512 }).notNull(),
    fromAddress: varchar('from_address', { length: 255 }).notNull(),
    toAddresses: jsonb('to_addresses').$type<string[]>().notNull().default([]),
    cc: jsonb('cc').$type<string[]>().notNull().default([]),
    bcc: jsonb('bcc').$type<string[]>().notNull().default([]),
    subject: text('subject').notNull().default(''),
    textBody: text('text_body'),
    htmlBody: text('html_body'),
    mailboxId: varchar('mailbox_id', { length: 64 })
      .notNull()
      .references(() => mailboxes.id, { onDelete: 'cascade' }),
    folder: varchar('folder', { length: 20 }).notNull().default('inbox'),
    isRead: boolean('is_read').notNull().default(false),
    isStarred: boolean('is_starred').notNull().default(false),
    isDraft: boolean('is_draft').notNull().default(false),
    /// Lifecycle status of an outbound email. Inbound + drafts use
    /// 'idle' / 'draft' respectively; outbound transitions
    /// idle → sending → (sent | failed | rate_limited). The mobile
    /// outbox + WS events drive the UI off this column so a "Sending…"
    /// row can appear in the Sent folder optimistically and resolve
    /// when the mail-engine reports back.
    status: varchar('status', { length: 16 }).notNull().default('idle'),
    /// Last error from the mail-engine for failed sends. Used by the
    /// retry UI ("Couldn't send — Recipient mailbox full"). Cleared on
    /// transition back to sending or sent.
    sendError: text('send_error'),
    /// Number of automatic retry attempts so far. Caps the backoff
    /// loop in the dispatcher.
    sendAttempts: integer('send_attempts').notNull().default(0),
    /// Last attempt timestamp — drives the backoff schedule.
    lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true }),
    /// When set in the future, the email is hidden from inbox until
    /// the timestamp passes. Used by the synthetic "Snoozed" folder.
    snoozeUntil: timestamp('snooze_until', { withTimezone: true }),
    /// When set in the future and status='sending', the dispatcher
    /// holds the send until this timestamp. Drives the synthetic
    /// "Scheduled" folder for outbound mail.
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
    threadId: varchar('thread_id', { length: 64 }).references(() => threads.id, {
      onDelete: 'set null',
    }),
    inReplyTo: varchar('in_reply_to', { length: 512 }),
    references: jsonb('references_list').$type<string[]>().notNull().default([]),
    headers: jsonb('headers').$type<Record<string, string>>().notNull().default({}),
    sizeBytes: integer('size_bytes').notNull().default(0),
    /// Bumped on every server-side mutation. Used by the optimistic
    /// sync engine for last-write-wins conflict resolution and
    /// idempotent reconciliation of WS event with local state.
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    // AI-derived flag: this message looks like it needs a reply from
    // the recipient (direct, open question, from a known human, etc).
    // Set by a background classifier; surfaces in the Today screen's
    // "Needs Reply" section. null = not yet classified.
    needsReply: boolean('needs_reply'),
    needsReplyReason: text('needs_reply_reason'),
    // AI-generated short summary (~2 sentences) of the email body.
    // Used for the unified inbox preview when the snippet is too dense.
    // null = not yet processed.
    autoSummary: text('auto_summary'),
    // Timestamp the AI worker last finished processing this email. Used
    // for idempotency — workers skip emails with this set unless the
    // job specifies force=true.
    aiProcessedAt: timestamp('ai_processed_at', { withTimezone: true }),
  },
  (table) => [
    // Inbox list query — covers WHERE mailbox_id = ? AND folder = ? ORDER BY created_at DESC.
    index('emails_mailbox_folder_created_idx').on(
      table.mailboxId,
      table.folder,
      table.createdAt,
    ),
    // Today screen "Needs Reply" section — partial index keeps it small.
    index('emails_needs_reply_idx')
      .on(table.mailboxId, table.createdAt)
      .where(sql`${table.needsReply} = true`),
    // Unread-counts query — WHERE mailbox_id IN (...) AND is_read = false GROUP BY folder.
    index('emails_mailbox_unread_folder_idx').on(
      table.mailboxId,
      table.isRead,
      table.folder,
    ),
    index('emails_thread_id_idx').on(table.threadId),
    index('emails_from_address_idx').on(table.fromAddress),
    index('emails_created_at_idx').on(table.createdAt),
    index('emails_message_id_idx').on(table.messageId),
  ],
)

export const attachments = pgTable(
  'attachments',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    emailId: varchar('email_id', { length: 64 })
      .notNull()
      .references(() => emails.id, { onDelete: 'cascade' }),
    filename: varchar('filename', { length: 255 }).notNull(),
    contentType: varchar('content_type', { length: 127 }).notNull(),
    contentId: varchar('content_id', { length: 255 }),
    sizeBytes: integer('size_bytes').notNull(),
    storageKey: text('storage_key').notNull(),
    // RSVP state — only set when the attachment is a text/calendar
    // invite the user responded to. Stored here (rather than a
    // separate table) because there's at most one response per
    // attachment and we want it to come along for free on the list
    // response. Values: 'accept' | 'tentative' | 'decline' | null.
    rsvpResponse: varchar('rsvp_response', { length: 16 }),
    rsvpRespondedAt: timestamp('rsvp_responded_at'),
  },
  (table) => [index('attachments_email_id_idx').on(table.emailId)],
)
