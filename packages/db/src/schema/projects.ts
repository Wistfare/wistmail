import { integer, jsonb, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core'
import { users } from './users'

export const projects = pgTable('projects', {
  id: varchar('id', { length: 64 }).primaryKey(),
  ownerId: varchar('owner_id', { length: 64 })
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  // active | completed | archived
  status: varchar('status', { length: 20 }).notNull().default('active'),
  progress: integer('progress').notNull().default(0), // 0–100
  memberUserIds: jsonb('member_user_ids').notNull().default([]),
  dueDate: timestamp('due_date', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
