import { boolean, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core'
import { users } from './users'

export const domains = pgTable('domains', {
  id: varchar('id', { length: 64 }).primaryKey(),
  name: varchar('name', { length: 255 }).notNull().unique(),
  userId: varchar('user_id', { length: 64 }).references(() => users.id, { onDelete: 'cascade' }),
  verified: boolean('verified').notNull().default(false),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  dkimPublicKey: text('dkim_public_key'),
  dkimPrivateKey: text('dkim_private_key'),
  dkimSelector: varchar('dkim_selector', { length: 63 }).notNull().default('wistmail'),
  spfRecord: text('spf_record'),
  dmarcRecord: text('dmarc_record'),
  mxVerified: boolean('mx_verified').notNull().default(false),
  spfVerified: boolean('spf_verified').notNull().default(false),
  dkimVerified: boolean('dkim_verified').notNull().default(false),
  dmarcVerified: boolean('dmarc_verified').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
