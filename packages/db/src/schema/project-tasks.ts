import { index, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core'
import { projects } from './projects'
import { users } from './users'

export const projectTasks = pgTable(
  'project_tasks',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    projectId: varchar('project_id', { length: 64 })
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 500 }).notNull(),
    // todo | in_progress | done
    status: varchar('status', { length: 20 }).notNull().default('todo'),
    assigneeId: varchar('assignee_id', { length: 64 }).references(() => users.id, {
      onDelete: 'set null',
    }),
    dueDate: timestamp('due_date', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('project_tasks_project_idx').on(table.projectId),
    index('project_tasks_assignee_idx').on(table.assigneeId),
  ],
)
