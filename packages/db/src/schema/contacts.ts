import { jsonb, pgTable, timestamp, varchar, index } from 'drizzle-orm/pg-core'
import { users } from './users.js'

export const contacts = pgTable(
  'contacts',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    email: varchar('email', { length: 255 }).notNull(),
    name: varchar('name', { length: 255 }),
    userId: varchar('user_id', { length: 64 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('contacts_user_id_idx').on(table.userId),
    index('contacts_email_idx').on(table.email),
  ],
)
