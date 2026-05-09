import { index, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core'
import { users } from './users'
import { projects } from './projects'

// Docs: V3 docs feature backing store. Stores title + icon + body
// (markdown). The Work screen's "Recent docs" block reads from the same
// table — earlier phases only used the metadata; phase 8 promotes the
// body column from idempotent ALTER (see app/index.ts ensureSchema)
// into a first-class field.
export const docs = pgTable(
  'docs',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    ownerId: varchar('owner_id', { length: 64 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    projectId: varchar('project_id', { length: 64 }).references(() => projects.id, {
      onDelete: 'set null',
    }),
    title: varchar('title', { length: 500 }).notNull(),
    icon: varchar('icon', { length: 32 }),
    /** Markdown body; nullable until the user actually saves content. */
    body: text('body'),
    /** Editorial state — defaults to draft. Phase 8 status pill maps
     *  this onto Draft / In review / Published. */
    status: varchar('status', { length: 20 }).notNull().default('draft'),
    /** When set, anyone with this opaque token can read the doc via
     *  `/share/docs/:token` (route ships with the share-link feature). */
    shareToken: varchar('share_token', { length: 64 }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('docs_owner_updated_idx').on(table.ownerId, table.updatedAt)],
)
