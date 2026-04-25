import { pgTable, primaryKey, real, varchar } from 'drizzle-orm/pg-core'
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
    /// 'user' = applied by the user, 'ai' = applied by the auto-label
    /// classifier. The UI shows AI labels with a sparkle icon and the
    /// user can convert them to confirmed user labels by tapping.
    source: varchar('source', { length: 8 }).notNull().default('user'),
    /// Classifier confidence 0..1. NULL for user-applied labels.
    confidence: real('confidence'),
  },
  (table) => [primaryKey({ columns: [table.emailId, table.labelId] })],
)
