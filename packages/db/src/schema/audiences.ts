import { integer, jsonb, pgTable, timestamp, varchar, index, primaryKey } from 'drizzle-orm/pg-core'
import { users } from './users'
import { contacts } from './contacts'

export const audiences = pgTable(
  'audiences',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
    userId: varchar('user_id', { length: 64 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    contactCount: integer('contact_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('audiences_user_id_idx').on(table.userId)],
)

export const audienceContacts = pgTable(
  'audience_contacts',
  {
    audienceId: varchar('audience_id', { length: 64 })
      .notNull()
      .references(() => audiences.id, { onDelete: 'cascade' }),
    contactId: varchar('contact_id', { length: 64 })
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    subscribedAt: timestamp('subscribed_at', { withTimezone: true }).notNull().defaultNow(),
    unsubscribedAt: timestamp('unsubscribed_at', { withTimezone: true }),
    topics: jsonb('topics').$type<string[]>().notNull().default([]),
  },
  (table) => [primaryKey({ columns: [table.audienceId, table.contactId] })],
)
