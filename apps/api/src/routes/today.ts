import { Hono } from 'hono'
import { and, asc, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm'
import {
  calendarEvents,
  emails,
  mailboxes,
  projects,
  projectTasks,
  todayDigests,
  users,
} from '@wistmail/db'
import { sessionAuth, type SessionEnv } from '../middleware/session-auth.js'
import { getDb } from '../lib/db.js'
import { cached } from '../lib/cache.js'
import { enqueueTodayDigest } from '../lib/ai-queue.js'
import {
  isValidTimezone,
  startOfDayInTz,
  startOfNextDayInTz,
} from '../lib/timezone.js'

export const todayRoutes = new Hono<SessionEnv>()
todayRoutes.use('*', sessionAuth)

/**
 * GET /api/v1/today
 *
 * One-shot aggregator for the Today screen. Returns four sections:
 *  - nextUp:       the next upcoming meeting (with meeting link) within 24h
 *  - needsReply:   up to 3 unread emails the AI flagged as needing a reply
 *  - schedule:     today's calendar events (00:00–24:00 in the user's tz)
 *  - recentActivity: recent project updates (task moves, recent touches)
 *
 * Day boundaries respect the user's IANA timezone — taken from the
 * X-Client-Timezone header (mobile sends it via the Dio interceptor)
 * with a fallback to the persisted users.timezone column, and finally
 * UTC. Without this a meeting at 11am Kigali (UTC+2) does not appear
 * in the schedule when the server runs on UTC, because the schedule
 * window is computed as 00:00 UTC → 24:00 UTC.
 *
 * The screen makes this one call on mount and again on pull-to-refresh.
 * WS `today.updated` broadcasts invalidate the client cache.
 */
todayRoutes.get('/', async (c) => {
  const userId = c.get('userId')
  const headerTz = c.req.header('x-client-timezone')
  const tz =
    headerTz && isValidTimezone(headerTz)
      ? headerTz
      : await loadUserTimezone(userId)
  // Cache key is per-(user, tz) — different tz means different day window.
  return c.json(
    await cached(`today:${tz}`, userId, 30, () => buildToday(userId, tz)),
  )
})

async function loadUserTimezone(userId: string): Promise<string> {
  try {
    const row = await getDb()
      .select({ tz: users.timezone })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
    const stored = row[0]?.tz
    if (stored && isValidTimezone(stored)) return stored
  } catch {
    /* fall through to UTC */
  }
  return 'UTC'
}

async function buildToday(userId: string, tz: string) {
  const db = getDb()
  const now = new Date()

  // Day window in the user's tz. The mobile client and the user's
  // persisted users.timezone both feed in via the route handler; this
  // function is tz-agnostic.
  const dayStart = startOfDayInTz(now, tz)
  const dayEnd = startOfNextDayInTz(now, tz)
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
              fromName: emails.fromName,
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

  // AI digest is best-effort. If the worker hasn't generated one yet
  // (or the user is brand new), the screen falls back to its component
  // sections — we don't block the response on it.
  const digestRows = await db
    .select({ content: todayDigests.content, generatedAt: todayDigests.generatedAt })
    .from(todayDigests)
    .where(eq(todayDigests.userId, userId))
    .limit(1)
  const digest = digestRows[0]
  const stale = !digest || Date.now() - digest.generatedAt.getTime() > 12 * 60 * 60 * 1000
  if (stale) {
    // Fire-and-forget regen — next pull will see fresh content.
    enqueueTodayDigest(userId).catch(() => {})
  }

  // Hydrate digest.priorities[] with display data so the mobile/web
  // can render rich rows (subject + sender + reason, etc.) instead of
  // bare ids. Without this the briefing mentions the email by reason
  // text but nothing surfaces as a tappable card on Today.
  const digestContent =
    digest && !stale
      ? await hydrateDigestPriorities(digest.content, userId, mailboxIds)
      : null

  return {
    nextUp: nextUpRows[0] ?? null,
    needsReply: needsReplyRows,
    schedule: scheduleRows,
    recentActivity,
    digest: digestContent,
  }
}

/// Pull display metadata for each priority id so the client can render
/// rich rows. Best-effort — a missing reference is just dropped.
async function hydrateDigestPriorities(
  content: unknown,
  userId: string,
  mailboxIds: string[],
): Promise<unknown> {
  if (!content || typeof content !== 'object') return content
  const root = content as Record<string, unknown>
  const priorities = Array.isArray(root.priorities)
    ? (root.priorities as Array<Record<string, unknown>>)
    : null
  if (!priorities || priorities.length === 0) return content

  const emailIds = priorities
    .filter((p) => p.kind === 'email' && typeof p.id === 'string')
    .map((p) => p.id as string)
  const eventIds = priorities
    .filter((p) => p.kind === 'event' && typeof p.id === 'string')
    .map((p) => p.id as string)
  const taskIds = priorities
    .filter((p) => p.kind === 'task' && typeof p.id === 'string')
    .map((p) => p.id as string)

  const db = getDb()
  const [emailRows, eventRows, taskRows] = await Promise.all([
    emailIds.length === 0 || mailboxIds.length === 0
      ? Promise.resolve([])
      : db
          .select({
            id: emails.id,
            subject: emails.subject,
            fromName: emails.fromName,
            fromAddress: emails.fromAddress,
            createdAt: emails.createdAt,
          })
          .from(emails)
          .where(
            and(
              inArray(emails.id, emailIds),
              inArray(emails.mailboxId, mailboxIds),
            ),
          ),
    eventIds.length === 0
      ? Promise.resolve([])
      : db
          .select({
            id: calendarEvents.id,
            title: calendarEvents.title,
            startAt: calendarEvents.startAt,
            endAt: calendarEvents.endAt,
            location: calendarEvents.location,
          })
          .from(calendarEvents)
          .where(
            and(
              inArray(calendarEvents.id, eventIds),
              eq(calendarEvents.userId, userId),
            ),
          ),
    taskIds.length === 0
      ? Promise.resolve([])
      : db
          .select({
            id: projectTasks.id,
            title: projectTasks.title,
            status: projectTasks.status,
            projectId: projectTasks.projectId,
          })
          .from(projectTasks)
          .innerJoin(projects, eq(projectTasks.projectId, projects.id))
          .where(
            and(
              inArray(projectTasks.id, taskIds),
              eq(projects.ownerId, userId),
            ),
          ),
  ])

  const emailById = new Map(emailRows.map((r) => [r.id, r]))
  const eventById = new Map(eventRows.map((r) => [r.id, r]))
  const taskById = new Map(taskRows.map((r) => [r.id, r]))

  const hydrated = priorities
    .map((p) => {
      const id = p.id as string
      let meta: Record<string, unknown> | null = null
      if (p.kind === 'email') {
        const e = emailById.get(id)
        if (e)
          meta = {
            subject: e.subject,
            fromName: e.fromName,
            fromAddress: e.fromAddress,
            createdAt: e.createdAt,
          }
      } else if (p.kind === 'event') {
        const e = eventById.get(id)
        if (e)
          meta = {
            title: e.title,
            startAt: e.startAt,
            endAt: e.endAt,
            location: e.location,
          }
      } else if (p.kind === 'task') {
        const t = taskById.get(id)
        if (t)
          meta = {
            title: t.title,
            status: t.status,
            projectId: t.projectId,
          }
      }
      // Drop priorities whose target was deleted or is no longer
      // accessible — the user can't act on a stale link.
      if (!meta) return null
      return { ...p, meta }
    })
    .filter((p): p is NonNullable<typeof p> => p !== null)

  return { ...root, priorities: hydrated }
}

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

