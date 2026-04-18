import { integer, pgTable, primaryKey, text, timestamp, varchar } from 'drizzle-orm/pg-core'
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
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
