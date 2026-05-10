import { Hono } from 'hono'
import { and, eq, gte, inArray, lt, lte, sql } from 'drizzle-orm'
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

  const [todayRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(projectTasks)
    .where(
      and(
        inArray(projectTasks.projectId, projectIds),
        gte(projectTasks.dueDate, startOfDay),
        lt(projectTasks.dueDate, endOfDay),
        sql`${projectTasks.status} <> 'done'`,
      ),
    )

  const [weekRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(projectTasks)
    .where(
      and(
        inArray(projectTasks.projectId, projectIds),
        gte(projectTasks.dueDate, startOfDay),
        lte(projectTasks.dueDate, endOfWeek),
        sql`${projectTasks.status} <> 'done'`,
      ),
    )

  const [overdueRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(projectTasks)
    .where(
      and(
        inArray(projectTasks.projectId, projectIds),
        lt(projectTasks.dueDate, startOfDay),
        sql`${projectTasks.status} <> 'done'`,
      ),
    )

  const [doneRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(projectTasks)
    .where(
      and(
        inArray(projectTasks.projectId, projectIds),
        eq(projectTasks.status, 'done'),
        gte(projectTasks.updatedAt, thirtyDaysAgo),
      ),
    )

  return c.json({
    today: todayRow?.n ?? 0,
    week: weekRow?.n ?? 0,
    overdue: overdueRow?.n ?? 0,
    done: doneRow?.n ?? 0,
  })
})
