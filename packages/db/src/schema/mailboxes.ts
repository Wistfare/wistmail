import { bigint, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core'
import { users } from './users.js'
import { domains } from './domains.js'

export const mailboxes = pgTable('mailboxes', {
  id: varchar('id', { length: 64 }).primaryKey(),
  address: varchar('address', { length: 255 }).notNull().unique(),
  displayName: varchar('display_name', { length: 255 }).notNull(),
  domainId: varchar('domain_id', { length: 64 })
    .notNull()
    .references(() => domains.id, { onDelete: 'cascade' }),
  userId: varchar('user_id', { length: 64 })
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  quotaBytes: bigint('quota_bytes', { mode: 'number' }).notNull().default(5368709120), // 5 GB
  usedBytes: bigint('used_bytes', { mode: 'number' }).notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
