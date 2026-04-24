import { index, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core'
import { users } from './users'
import { projects } from './projects'

// Docs: lightweight stub for the Work screen's "Recent docs" block.
// Full editor/collab lives in a later phase; this table is just enough
// to render a titled row with a project label and a timestamp.
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
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('docs_owner_updated_idx').on(table.ownerId, table.updatedAt)],
)
