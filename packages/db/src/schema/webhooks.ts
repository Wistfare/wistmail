import { boolean, integer, jsonb, pgTable, text, timestamp, varchar, index } from 'drizzle-orm/pg-core'
import { users } from './users'
import { domains } from './domains'

export const webhooks = pgTable(
  'webhooks',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    url: text('url').notNull(),
    events: jsonb('events').$type<string[]>().notNull().default([]),
    secret: varchar('secret', { length: 128 }).notNull(),
    domainId: varchar('domain_id', { length: 64 }).references(() => domains.id, {
      onDelete: 'set null',
    }),
    userId: varchar('user_id', { length: 64 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('webhooks_user_id_idx').on(table.userId)],
)

export const webhookLogs = pgTable(
  'webhook_logs',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    webhookId: varchar('webhook_id', { length: 64 })
      .notNull()
      .references(() => webhooks.id, { onDelete: 'cascade' }),
    event: varchar('event', { length: 50 }).notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    responseStatus: integer('response_status'),
    attempts: integer('attempts').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('webhook_logs_webhook_id_idx').on(table.webhookId),
    index('webhook_logs_created_at_idx').on(table.createdAt),
  ],
)
