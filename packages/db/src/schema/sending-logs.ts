import { jsonb, pgTable, timestamp, varchar, index } from 'drizzle-orm/pg-core'
import { emails } from './emails'
import { apiKeys } from './api-keys'

export const sendingLogs = pgTable(
  'sending_logs',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    emailId: varchar('email_id', { length: 64 })
      .notNull()
      .references(() => emails.id, { onDelete: 'cascade' }),
    apiKeyId: varchar('api_key_id', { length: 64 }).references(() => apiKeys.id, {
      onDelete: 'set null',
    }),
    status: varchar('status', { length: 20 }).notNull().default('queued'),
    openedAt: timestamp('opened_at', { withTimezone: true }),
    clickedAt: timestamp('clicked_at', { withTimezone: true }),
    bouncedAt: timestamp('bounced_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('sending_logs_email_id_idx').on(table.emailId),
    index('sending_logs_status_idx').on(table.status),
    index('sending_logs_created_at_idx').on(table.createdAt),
  ],
)
