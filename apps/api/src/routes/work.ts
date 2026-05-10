import { Hono } from 'hono'
import { eq, inArray, sql } from 'drizzle-orm'
import { projects, projectTasks } from '@wistmail/db'
import { sessionAuth, type SessionEnv } from '../middleware/session-auth.js'
import { getDb } from '../lib/db.js'

export const workRoutes = new Hono<SessionEnv>()
workRoutes.use('*', sessionAuth)

/**
 * GET /api/v1/work/counters
 *
 * Aggregate counters powering the WorkSidebar header and Overdue / Done
 * sections. Returns:
 *   - today:    tasks due today that aren't done yet
 *   - week:     tasks due in the next 7 days that aren't done yet
 *   - overdue:  tasks past their due date that aren't done
 *   - done:     tasks marked done in the last 30 days
 *
 * One round-trip on the sidebar mount; aggregated server-side via a
 * single grouped query so it stays cheap on busy accounts.
 */
workRoutes.get('/counters', async (c) => {
  const userId = c.get('userId')
  const db = getDb()

  // Resolve the user's project ids first so we can scope every count.
  const ownedProjects = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.ownerId, userId))
  const projectIds = ownedProjects.map((p) => p.id)

  if (projectIds.length === 0) {
    return c.json({ today: 0, week: 0, overdue: 0, done: 0 })
  }

  const now = new Date()
  const startOfDay = new Date(now)
  startOfDay.setHours(0, 0, 0, 0)
  const endOfDay = new Date(startOfDay)
  endOfDay.setDate(endOfDay.getDate() + 1)
  const endOfWeek = new Date(startOfDay)
  endOfWeek.setDate(endOfWeek.getDate() + 7)
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  // Coalesce all four counters into a single grouped query — the
  // four separate `count(*)` queries were issuing 4 round-trips for
  // a sidebar mount that fires on every navigation. `count(*) FILTER
  // (WHERE ...)` lets Postgres scan the rows once and bin them.
  const [counters] = await db
    .select({
      today: sql<number>`count(*) filter (where ${projectTasks.dueDate} >= ${startOfDay} and ${projectTasks.dueDate} < ${endOfDay} and ${projectTasks.status} <> 'done')::int`,
      week: sql<number>`count(*) filter (where ${projectTasks.dueDate} >= ${startOfDay} and ${projectTasks.dueDate} <= ${endOfWeek} and ${projectTasks.status} <> 'done')::int`,
      overdue: sql<number>`count(*) filter (where ${projectTasks.dueDate} < ${startOfDay} and ${projectTasks.status} <> 'done')::int`,
      done: sql<number>`count(*) filter (where ${projectTasks.status} = 'done' and ${projectTasks.updatedAt} >= ${thirtyDaysAgo})::int`,
    })
    .from(projectTasks)
    .where(inArray(projectTasks.projectId, projectIds))

  return c.json({
    today: counters?.today ?? 0,
    week: counters?.week ?? 0,
    overdue: counters?.overdue ?? 0,
    done: counters?.done ?? 0,
  })
})
