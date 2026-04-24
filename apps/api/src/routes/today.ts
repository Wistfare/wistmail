import { Hono } from 'hono'
import { and, asc, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm'
import {
  calendarEvents,
  emails,
  mailboxes,
  projects,
  projectTasks,
  users,
} from '@wistmail/db'
import { sessionAuth, type SessionEnv } from '../middleware/session-auth.js'
import { getDb } from '../lib/db.js'

export const todayRoutes = new Hono<SessionEnv>()
todayRoutes.use('*', sessionAuth)

/**
 * GET /api/v1/today
 *
 * One-shot aggregator for the Today screen. Returns four sections:
 *  - nextUp:       the next upcoming meeting (with meeting link) within 24h
 *  - needsReply:   up to 3 unread emails the AI flagged as needing a reply
 *  - schedule:     today's calendar events (midnight-to-midnight, user tz-naive)
 *  - recentActivity: recent project updates (task moves, recent touches)
 *
 * The screen makes this one call on mount and again on pull-to-refresh.
 * WS `today.updated` broadcasts invalidate the client cache.
 */
todayRoutes.get('/', async (c) => {
  const userId = c.get('userId')
  const db = getDb()
  const now = new Date()

  // Today's window in server time. The mobile client passes `?tz=` once
  // we add full-timezone support; for now all boundaries use server tz.
  const dayStart = new Date(now)
  dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(dayStart)
  dayEnd.setDate(dayEnd.getDate() + 1)
  const twentyFourHoursOut = new Date(now.getTime() + 24 * 60 * 60 * 1000)

  // Resolve the user's mailbox set once — needsReply + nextUp both need it.
  const userMailboxes = await db
    .select({ id: mailboxes.id })
    .from(mailboxes)
    .where(eq(mailboxes.userId, userId))
  const mailboxIds = userMailboxes.map((m) => m.id)

  const [nextUpRows, needsReplyRows, scheduleRows, activeProjects] =
    await Promise.all([
      // Next upcoming meeting within 24h — prefer events with a meeting link.
      db
        .select()
        .from(calendarEvents)
        .where(
          and(
            eq(calendarEvents.userId, userId),
            gte(calendarEvents.startAt, now),
            lte(calendarEvents.startAt, twentyFourHoursOut),
          ),
        )
        .orderBy(asc(calendarEvents.startAt))
        .limit(1),

      // Needs-reply: AI-flagged + still unread. Cap at 3 rows.
      mailboxIds.length === 0
        ? Promise.resolve([])
        : db
            .select({
              id: emails.id,
              subject: emails.subject,
              fromAddress: emails.fromAddress,
              createdAt: emails.createdAt,
              needsReplyReason: emails.needsReplyReason,
            })
            .from(emails)
            .where(
              and(
                inArray(emails.mailboxId, mailboxIds),
                eq(emails.needsReply, true),
                eq(emails.isRead, false),
                eq(emails.folder, 'inbox'),
              ),
            )
            .orderBy(desc(emails.createdAt))
            .limit(3),

      // Today's events.
      db
        .select()
        .from(calendarEvents)
        .where(
          and(
            eq(calendarEvents.userId, userId),
            gte(calendarEvents.startAt, dayStart),
            lte(calendarEvents.startAt, dayEnd),
          ),
        )
        .orderBy(asc(calendarEvents.startAt)),

      // Projects recently touched — we pull recent task moves out of this.
      db
        .select({ id: projects.id, name: projects.name })
        .from(projects)
        .where(and(eq(projects.ownerId, userId), eq(projects.status, 'active')))
        .orderBy(desc(projects.updatedAt))
        .limit(5),
    ])

  // Recent activity: tasks whose status changed in the last 24h for the
  // user's active projects. Keep the query tight — one join, one index scan.
  let recentActivity: Array<{
    projectId: string
    projectName: string
    taskId: string
    taskTitle: string
    status: string
    updatedAt: Date
  }> = []
  if (activeProjects.length > 0) {
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const projectIds = activeProjects.map((p) => p.id)
    const rows = await db
      .select({
        projectId: projectTasks.projectId,
        taskId: projectTasks.id,
        taskTitle: projectTasks.title,
        status: projectTasks.status,
        updatedAt: projectTasks.updatedAt,
      })
      .from(projectTasks)
      .where(
        and(
          inArray(projectTasks.projectId, projectIds),
          gte(projectTasks.updatedAt, yesterday),
        ),
      )
      .orderBy(desc(projectTasks.updatedAt))
      .limit(5)
    const nameById = new Map(activeProjects.map((p) => [p.id, p.name]))
    recentActivity = rows.map((r) => ({
      projectId: r.projectId,
      projectName: nameById.get(r.projectId) ?? '',
      taskId: r.taskId,
      taskTitle: r.taskTitle,
      status: r.status,
      updatedAt: r.updatedAt,
    }))
  }

  return c.json({
    nextUp: nextUpRows[0] ?? null,
    needsReply: needsReplyRows,
    schedule: scheduleRows,
    recentActivity,
  })
})

/**
 * POST /api/v1/today/needs-reply/:emailId
 *
 * Admin/internal endpoint the AI classifier hits to flag an email as
 * needing a reply. The flag is gated on ownership via mailbox join.
 * Exposed on the authenticated API (not the internal/inbound route)
 * so we can experiment with a user-invoked "mark as needs reply"
 * button later without adding another endpoint.
 *
 * Body: { needsReply: boolean, reason?: string }
 */
todayRoutes.post('/needs-reply/:emailId', async (c) => {
  const emailId = c.req.param('emailId')
  const body = await c.req.json().catch(() => ({}))
  const needsReply = body.needsReply === true
  const reason = typeof body.reason === 'string' ? body.reason.slice(0, 500) : null

  const db = getDb()
  const userId = c.get('userId')

  // Ownership check via mailbox join, then update in one statement.
  const result = await db.execute(sql`
    UPDATE emails
       SET needs_reply = ${needsReply},
           needs_reply_reason = ${reason},
           updated_at = now()
     WHERE id = ${emailId}
       AND mailbox_id IN (
         SELECT id FROM mailboxes WHERE user_id = ${userId}
       )
  `)
  const rowCount = (result as unknown as { rowCount?: number }).rowCount ?? 0
  if (rowCount === 0) {
    return c.json(
      { error: { code: 'NOT_FOUND', message: 'Email not found' } },
      404,
    )
  }
  return c.json({ ok: true })
})

// Keep the `users` import in use for future expansion (avatar surfacing etc).
void users
