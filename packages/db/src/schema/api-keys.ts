import { jsonb, pgTable, timestamp, varchar, index } from 'drizzle-orm/pg-core'
import { users } from './users'
import { domains } from './domains'

export const apiKeys = pgTable(
  'api_keys',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    keyHash: varchar('key_hash', { length: 128 }).notNull().unique(),
    keyPrefix: varchar('key_prefix', { length: 10 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    scopes: jsonb('scopes').$type<string[]>().notNull().default([]),
    domainId: varchar('domain_id', { length: 64 }).references(() => domains.id, {
      onDelete: 'set null',
    }),
    userId: varchar('user_id', { length: 64 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('api_keys_user_id_idx').on(table.userId),
    index('api_keys_key_hash_idx').on(table.keyHash),
  ],
)
