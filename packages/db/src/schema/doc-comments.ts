import { index, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core'
import { docs } from './docs'
import { users } from './users'

/**
 * V3 doc comments — one row per comment, ordered by `createdAt`.
 *
 * Pencil reference: `DocsV3-Editor` right rail (`IMtz2`).
 * The current iteration is flat (no threading) and not anchored to a
 * specific paragraph; future work could add `anchorBlockId` to pin
 * comments to a span of the doc body.
 */
export const docComments = pgTable(
  'doc_comments',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    docId: varchar('doc_id', { length: 64 })
      .notNull()
      .references(() => docs.id, { onDelete: 'cascade' }),
    authorId: varchar('author_id', { length: 64 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('doc_comments_doc_created_idx').on(table.docId, table.createdAt),
  ],
)
