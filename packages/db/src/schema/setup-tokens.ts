import { pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core'
import { domains } from './domains'

export const setupTokens = pgTable('setup_tokens', {
  id: varchar('id', { length: 64 }).primaryKey(),
  token: text('token').notNull().unique(),
  domainId: varchar('domain_id', { length: 64 }).references(() => domains.id, {
    onDelete: 'cascade',
  }),
  step: varchar('step', { length: 20 }).notNull().default('domain'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
