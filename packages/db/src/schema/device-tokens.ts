import { pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core'
import { users } from './users'

export const deviceTokens = pgTable('device_tokens', {
  id: varchar('id', { length: 64 }).primaryKey(),
  userId: varchar('user_id', { length: 64 })
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  platform: varchar('platform', { length: 16 }).notNull(),
  locale: varchar('locale', { length: 16 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
