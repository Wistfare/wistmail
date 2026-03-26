import { boolean, integer, jsonb, pgTable, text, timestamp, varchar, index } from 'drizzle-orm/pg-core'
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
    threadId: varchar('thread_id', { length: 64 }).references(() => threads.id, {
      onDelete: 'set null',
    }),
    inReplyTo: varchar('in_reply_to', { length: 512 }),
    references: jsonb('references_list').$type<string[]>().notNull().default([]),
    headers: jsonb('headers').$type<Record<string, string>>().notNull().default({}),
    sizeBytes: integer('size_bytes').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('emails_mailbox_id_folder_idx').on(table.mailboxId, table.folder),
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
    sizeBytes: integer('size_bytes').notNull(),
    storageKey: text('storage_key').notNull(),
  },
  (table) => [index('attachments_email_id_idx').on(table.emailId)],
)
