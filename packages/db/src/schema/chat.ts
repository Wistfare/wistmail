import { index, integer, pgTable, primaryKey, text, timestamp, varchar } from 'drizzle-orm/pg-core'
import { users } from './users'

export const conversations = pgTable('conversations', {
  id: varchar('id', { length: 64 }).primaryKey(),
  // 'direct' for 1:1, 'group' for multi-party
  kind: varchar('kind', { length: 16 }).notNull().default('direct'),
  // Optional display name for group chats
  title: varchar('title', { length: 255 }),
  createdBy: varchar('created_by', { length: 64 })
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  lastMessageAt: timestamp('last_message_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const conversationParticipants = pgTable(
  'conversation_participants',
  {
    conversationId: varchar('conversation_id', { length: 64 })
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    userId: varchar('user_id', { length: 64 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // Last time this user marked this conversation as read
    lastReadAt: timestamp('last_read_at', { withTimezone: true }),
    // Cached for fast unread-count queries
    unreadCount: integer('unread_count').notNull().default(0),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.conversationId, table.userId] }),
  }),
)

export const chatMessages = pgTable('chat_messages', {
  id: varchar('id', { length: 64 }).primaryKey(),
  conversationId: varchar('conversation_id', { length: 64 })
    .notNull()
    .references(() => conversations.id, { onDelete: 'cascade' }),
  senderId: varchar('sender_id', { length: 64 })
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  /// Set when the sender edits the message in place. The original
  /// `createdAt` stays — clients show "(edited)" next to the timestamp
  /// when this is non-null. Null means the message has never been edited.
  editedAt: timestamp('edited_at', { withTimezone: true }),
  /// Soft-delete marker. We keep the row so reply context, read
  /// receipts, and message ordering aren't disrupted; the route layer
  /// strips `content` in API responses when this is set so the body
  /// can never be re-rendered after delete.
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

/// Per-message read receipts. We write one row per (message, user)
/// the first time a user opens the conversation containing that
/// message. Conversation-level `lastReadAt` stays as the
/// fast-unread-count bookkeeping; this table powers the "seen by"
/// avatars rendered under each message.
export const chatMessageReads = pgTable(
  'chat_message_reads',
  {
    messageId: varchar('message_id', { length: 64 })
      .notNull()
      .references(() => chatMessages.id, { onDelete: 'cascade' }),
    userId: varchar('user_id', { length: 64 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    readAt: timestamp('read_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.messageId, table.userId] }),
    userIdIdx: index('chat_message_reads_user_id_idx').on(table.userId),
  }),
)

/// Chat attachments. Two-step upload: client POSTs the bytes to
/// `/chat/attachments` and gets back an `id`; later, when sending
/// the message, the client passes that id in the `attachmentIds`
/// array. The send route validates that every id was uploaded by
/// the same user AND is still unattached, then stamps the
/// `messageId` here.
///
/// Bytes live on disk via `attachment-storage.ts` — same backing
/// store as email attachments. Orphaned uploads (uploaded but never
/// attached) can be GC'd by a follow-up cron; not in this phase.
export const chatAttachments = pgTable(
  'chat_attachments',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    /// Null while uploaded-but-not-yet-attached; set when the send
    /// route claims this attachment.
    messageId: varchar('message_id', { length: 64 }).references(
      () => chatMessages.id,
      { onDelete: 'cascade' },
    ),
    /// The user who uploaded the bytes. Used to gate `attach` calls
    /// (an uploader can only attach their own uploads) and to
    /// scope orphan cleanup.
    uploaderId: varchar('uploader_id', { length: 64 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    filename: varchar('filename', { length: 255 }).notNull(),
    contentType: varchar('content_type', { length: 127 }).notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    storageKey: text('storage_key').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    messageIdIdx: index('chat_attachments_message_id_idx').on(table.messageId),
    uploaderIdIdx: index('chat_attachments_uploader_id_idx').on(table.uploaderId),
  }),
)
