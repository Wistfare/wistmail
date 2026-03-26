import { pgTable, primaryKey, varchar } from 'drizzle-orm/pg-core'
import { mailboxes } from './mailboxes'
import { emails } from './emails'

export const labels = pgTable('labels', {
  id: varchar('id', { length: 64 }).primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  color: varchar('color', { length: 7 }).notNull().default('#6B7280'),
  mailboxId: varchar('mailbox_id', { length: 64 })
    .notNull()
    .references(() => mailboxes.id, { onDelete: 'cascade' }),
})

export const emailLabels = pgTable(
  'email_labels',
  {
    emailId: varchar('email_id', { length: 64 })
      .notNull()
      .references(() => emails.id, { onDelete: 'cascade' }),
    labelId: varchar('label_id', { length: 64 })
      .notNull()
      .references(() => labels.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.emailId, table.labelId] })],
)
