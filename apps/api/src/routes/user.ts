import { Hono } from 'hono'
import { getCookie, deleteCookie } from 'hono/cookie'
import { z } from 'zod'
import { eq, and, gte, lte, inArray, sql } from 'drizzle-orm'
import { ValidationError, AuthenticationError } from '@wistmail/shared'
import { generateId } from '@wistmail/shared'
import {
  users,
  mailboxes,
  deviceTokens,
  sessions,
  emails,
  calendarEvents,
  projects,
  projectTasks,
} from '@wistmail/db'
import { sessionAuth, type SessionEnv } from '../middleware/session-auth.js'
import { getDb } from '../lib/db.js'

export const userRoutes = new Hono<SessionEnv>()

userRoutes.use('*', sessionAuth)

/**
 * POST /api/v1/user/device-tokens
 * Register (or update) an FCM device token for this user.
 */
userRoutes.post('/device-tokens', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const schema = z.object({
    token: z.string().min(10),
    platform: z.enum(['ios', 'android', 'web']),
    locale: z.string().max(16).optional(),
  })
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    throw new ValidationError('Invalid device token payload', {
      errors: parsed.error.flatten().fieldErrors,
    })
  }

  const db = getDb()
  const userId = c.get('userId')
  const now = new Date()

  const existing = await db
    .select({ id: deviceTokens.id, userId: deviceTokens.userId })
    .from(deviceTokens)
    .where(eq(deviceTokens.token, parsed.data.token))
    .limit(1)

  if (existing.length > 0) {
    await db
      .update(deviceTokens)
      .set({
        userId,
        platform: parsed.data.platform,
        locale: parsed.data.locale,
        updatedAt: now,
      })
      .where(eq(deviceTokens.id, existing[0].id))
    return c.json({ id: existing[0].id, updated: true })
  }

  const id = generateId('dev')
  await db.insert(deviceTokens).values({
    id,
    userId,
    token: parsed.data.token,
    platform: parsed.data.platform,
    locale: parsed.data.locale,
    createdAt: now,
    updatedAt: now,
  })
  return c.json({ id, updated: false }, 201)
})

/**
 * DELETE /api/v1/user/device-tokens
 * Unregister an FCM device token (e.g. on logout or app uninstall).
 */
userRoutes.delete('/device-tokens', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const schema = z.object({ token: z.string().min(10) })
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    throw new ValidationError('Invalid payload')
  }

  const db = getDb()
  await db
    .delete(deviceTokens)
    .where(
      and(
        eq(deviceTokens.token, parsed.data.token),
        eq(deviceTokens.userId, c.get('userId')),
      ),
    )
  return c.json({ ok: true })
})

/**
 * GET /api/v1/user/mailboxes — List mailboxes owned by the current user.
 */
userRoutes.get('/mailboxes', async (c) => {
  const db = getDb()
  const result = await db
    .select({
      id: mailboxes.id,
      address: mailboxes.address,
      displayName: mailboxes.displayName,
      domainId: mailboxes.domainId,
    })
    .from(mailboxes)
    .where(eq(mailboxes.userId, c.get('userId')))

  return c.json({ mailboxes: result })
})

/**
 * GET /api/v1/user/profile
 */
userRoutes.get('/profile', async (c) => {
  const db = getDb()
  const result = await db.select({
    id: users.id,
    name: users.name,
    email: users.email,
    avatarUrl: users.avatarUrl,
    createdAt: users.createdAt,
  }).from(users).where(eq(users.id, c.get('userId'))).limit(1)

  if (result.length === 0) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'User not found' } }, 404)
  }

  return c.json({ user: result[0] })
})

/**
 * PATCH /api/v1/user/profile
 */
userRoutes.patch('/profile', async (c) => {
  const body = await c.req.json()
  const schema = z.object({
    name: z.string().min(2).max(255).optional(),
    avatarUrl: z.string().url().nullable().optional(),
  })

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    throw new ValidationError('Invalid input', { errors: parsed.error.flatten().fieldErrors })
  }

  const db = getDb()
  const updateData: Record<string, unknown> = { updatedAt: new Date() }
  if (parsed.data.name !== undefined) updateData.name = parsed.data.name
  if (parsed.data.avatarUrl !== undefined) updateData.avatarUrl = parsed.data.avatarUrl

  await db.update(users).set(updateData).where(eq(users.id, c.get('userId')))

  return c.json({ ok: true })
})

/**
 * POST /api/v1/user/change-password
 */
userRoutes.post('/change-password', async (c) => {
  const body = await c.req.json()
  const schema = z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8)
      .regex(/[A-Z]/, 'Must include uppercase')
      .regex(/[a-z]/, 'Must include lowercase')
      .regex(/\d/, 'Must include number'),
  })

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    throw new ValidationError('Invalid input', { errors: parsed.error.flatten().fieldErrors })
  }

  const { verify, hash } = await import('argon2')
  const db = getDb()

  const result = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, c.get('userId'))).limit(1)
  if (result.length === 0) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'User not found' } }, 404)
  }

  const valid = await verify(result[0].passwordHash, parsed.data.currentPassword)
  if (!valid) {
    throw new ValidationError('Current password is incorrect')
  }

  const newHash = await hash(parsed.data.newPassword)
  await db.update(users).set({ passwordHash: newHash, updatedAt: new Date() }).where(eq(users.id, c.get('userId')))

  return c.json({ ok: true })
})

/**
 * GET /api/v1/user/me/stats
 *
 * Stats cards on the MobileV3 Me screen:
 *  - inboxUnread: total unread emails in inbox folder across all mailboxes
 *  - eventsToday: calendar events starting today (midnight-to-midnight)
 *  - tasksOpen:   incomplete project tasks assigned to this user
 *
 * One-shot fetch — the screen doesn't paginate this data.
 */
userRoutes.get('/me/stats', async (c) => {
  const userId = c.get('userId')
  const db = getDb()
  const now = new Date()
  const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1)

  const mailboxIds = (
    await db.select({ id: mailboxes.id }).from(mailboxes).where(eq(mailboxes.userId, userId))
  ).map((r) => r.id)

  const [inboxUnreadRow, eventsTodayRow, tasksOpenRow] = await Promise.all([
    mailboxIds.length === 0
      ? Promise.resolve([{ count: 0 }])
      : db
          .select({ count: sql<number>`count(*)::int` })
          .from(emails)
          .where(
            and(
              inArray(emails.mailboxId, mailboxIds),
              eq(emails.folder, 'inbox'),
              eq(emails.isRead, false),
            ),
          ),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(calendarEvents)
      .where(
        and(
          eq(calendarEvents.userId, userId),
          gte(calendarEvents.startAt, dayStart),
          lte(calendarEvents.startAt, dayEnd),
        ),
      ),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(projectTasks)
      .where(
        and(
          eq(projectTasks.assigneeId, userId),
          sql`${projectTasks.status} <> 'done'`,
        ),
      ),
  ])

  return c.json({
    inboxUnread: inboxUnreadRow[0]?.count ?? 0,
    eventsToday: eventsTodayRow[0]?.count ?? 0,
    tasksOpen: tasksOpenRow[0]?.count ?? 0,
  })
})

/**
 * GET /api/v1/user/preferences
 *
 * Returns focus mode + per-channel notification prefs. Used by the
 * MobileV3 Me screen to render the Focus toggle and Notifications row.
 */
userRoutes.get('/preferences', async (c) => {
  const db = getDb()
  const result = await db
    .select({
      focusModeEnabled: users.focusModeEnabled,
      focusModeUntil: users.focusModeUntil,
      notificationPrefs: users.notificationPrefs,
    })
    .from(users)
    .where(eq(users.id, c.get('userId')))
    .limit(1)
  if (result.length === 0) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'User not found' } }, 404)
  }
  const row = result[0]
  // Focus mode auto-expires once the `until` timestamp has passed; surface
  // that to the client as the plain-false state rather than making it derive.
  const until = row.focusModeUntil
  const active = row.focusModeEnabled && (!until || until.getTime() > Date.now())
  return c.json({
    focusModeEnabled: active,
    focusModeUntil: active ? until?.toISOString() ?? null : null,
    notificationPrefs: row.notificationPrefs ?? { mail: true, chat: true, calendar: true },
  })
})

/**
 * PUT /api/v1/user/preferences
 *
 * Body: { focusModeEnabled?, focusModeUntil? (ISO|null), notificationPrefs? }
 */
userRoutes.put('/preferences', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const schema = z.object({
    focusModeEnabled: z.boolean().optional(),
    focusModeUntil: z.string().datetime().nullable().optional(),
    notificationPrefs: z
      .object({
        mail: z.boolean().optional(),
        chat: z.boolean().optional(),
        calendar: z.boolean().optional(),
      })
      .optional(),
  })
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    throw new ValidationError('Invalid preferences', {
      errors: parsed.error.flatten().fieldErrors,
    })
  }

  const db = getDb()
  const update: Record<string, unknown> = { updatedAt: new Date() }
  if (parsed.data.focusModeEnabled !== undefined) {
    update.focusModeEnabled = parsed.data.focusModeEnabled
  }
  if (parsed.data.focusModeUntil !== undefined) {
    update.focusModeUntil = parsed.data.focusModeUntil
      ? new Date(parsed.data.focusModeUntil)
      : null
  }
  if (parsed.data.notificationPrefs !== undefined) {
    update.notificationPrefs = parsed.data.notificationPrefs
  }

  if (Object.keys(update).length > 1) {
    await db.update(users).set(update).where(eq(users.id, c.get('userId')))
  }
  return c.json({ ok: true })
})

/**
 * GET /api/v1/user/connected-accounts
 *
 * The Me screen's "Connected accounts" row shows the user's mailboxes
 * plus any external providers they've hooked up. Right now we only have
 * native mailboxes — external OAuth providers come later. Returning the
 * endpoint up-front keeps the mobile side stable.
 */
userRoutes.get('/connected-accounts', async (c) => {
  const db = getDb()
  const mbxs = await db
    .select({
      id: mailboxes.id,
      address: mailboxes.address,
      displayName: mailboxes.displayName,
    })
    .from(mailboxes)
    .where(eq(mailboxes.userId, c.get('userId')))

  return c.json({
    accounts: mbxs.map((m) => ({
      id: m.id,
      kind: 'wistmail' as const,
      label: m.displayName || m.address,
      address: m.address,
    })),
  })
})

// Keep import referenced even when projects aren't queried in every
// handler — prevents dead-import churn when adding new stats later.
void projects

/**
 * POST /api/v1/user/delete-account
 * Body: { password: string, confirmation: 'DELETE' }
 *
 * Permanently deletes the user and cascades through every foreign-key
 * relationship (emails, mailboxes, sessions, chat, calendar, projects, …).
 * Also clears the session cookie.
 */
userRoutes.post('/delete-account', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const schema = z.object({
    password: z.string().min(1),
    confirmation: z.literal('DELETE'),
  })
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    throw new ValidationError('Type "DELETE" and enter your password to confirm', {
      errors: parsed.error.flatten().fieldErrors,
    })
  }

  const { verify } = await import('argon2')
  const db = getDb()
  const userId = c.get('userId')

  const result = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  if (result.length === 0) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'User not found' } }, 404)
  }

  const valid = await verify(result[0].passwordHash, parsed.data.password)
  if (!valid) throw new AuthenticationError('Password incorrect')

  // Delete the user — cascades handle the rest via ON DELETE CASCADE.
  await db.delete(users).where(eq(users.id, userId))

  // Be thorough: drop sessions explicitly in case cascade is configured
  // differently on an older DB.
  const token = getCookie(c, 'wm_session')
  if (token) await db.delete(sessions).where(eq(sessions.token, token))
  deleteCookie(c, 'wm_session')

  return c.json({ ok: true })
})
