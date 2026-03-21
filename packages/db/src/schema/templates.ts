import { jsonb, pgTable, text, timestamp, varchar, index } from 'drizzle-orm/pg-core'
import { users } from './users.js'

export const templates = pgTable(
  'templates',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
    subject: text('subject').notNull().default(''),
    html: text('html').notNull().default(''),
    variables: jsonb('variables')
      .$type<Array<{ name: string; defaultValue: string | null; required: boolean }>>()
      .notNull()
      .default([]),
    userId: varchar('user_id', { length: 64 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('templates_user_id_idx').on(table.userId)],
)
