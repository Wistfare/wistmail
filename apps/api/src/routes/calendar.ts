import { Hono } from 'hono'
import { z } from 'zod'
import { and, asc, eq, gte, isNotNull, lte, ne } from 'drizzle-orm'
import { ValidationError, generateId } from '@wistmail/shared'
import { calendarEvents } from '@wistmail/db'
import { sessionAuth, type SessionEnv } from '../middleware/session-auth.js'
import { getDb } from '../lib/db.js'

export const calendarRoutes = new Hono<SessionEnv>()
calendarRoutes.use('*', sessionAuth)

const eventSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().max(5000).optional(),
  location: z.string().max(255).optional(),
  attendees: z.array(z.string()).default([]),
  startAt: z.string(),  // ISO 8601
  endAt: z.string(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  meetingLink: z.string().url().nullable().optional(),
  hasWaitingRoom: z.boolean().optional(),
  reminderMinutes: z.array(z.number().int().nonnegative()).optional(),
  notes: z.string().max(5000).optional(),
})

/** GET /api/v1/calendar/events?from=ISO&to=ISO */
calendarRoutes.get('/events', async (c) => {
  const userId = c.get('userId')
  const from = c.req.query('from')
  const to = c.req.query('to')

  const db = getDb()
  const conditions = [eq(calendarEvents.userId, userId)]
  if (from) conditions.push(gte(calendarEvents.startAt, new Date(from)))
  if (to) conditions.push(lte(calendarEvents.startAt, new Date(to)))

  const rows = await db
    .select()
    .from(calendarEvents)
    .where(and(...conditions))
    .orderBy(asc(calendarEvents.startAt))

  return c.json({ events: rows })
})

/** GET /api/v1/calendar/events/meetings — upcoming events with a meeting link. */
calendarRoutes.get('/events/meetings', async (c) => {
  const userId = c.get('userId')
  const db = getDb()
  const rows = await db
    .select()
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.userId, userId),
        isNotNull(calendarEvents.meetingLink),
        ne(calendarEvents.meetingLink, ''),
      ),
    )
    .orderBy(asc(calendarEvents.startAt))
  return c.json({ meetings: rows })
})

/** GET /api/v1/calendar/events/:id */
calendarRoutes.get('/events/:id', async (c) => {
  const db = getDb()
  const userId = c.get('userId')
  const id = c.req.param('id')
  const row = await db
    .select()
    .from(calendarEvents)
    .where(and(eq(calendarEvents.id, id), eq(calendarEvents.userId, userId)))
    .limit(1)
  if (row.length === 0) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Event not found' } }, 404)
  }
  return c.json(row[0])
})

/** POST /api/v1/calendar/events */
calendarRoutes.post('/events', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const parsed = eventSchema.safeParse(body)
  if (!parsed.success) {
    throw new ValidationError('Invalid event', { errors: parsed.error.flatten().fieldErrors })
  }

  const userId = c.get('userId')
  const db = getDb()
  const id = generateId('evt')
  const now = new Date()

  const startAt = new Date(parsed.data.startAt)
  const endAt = new Date(parsed.data.endAt)
  if (endAt < startAt) throw new ValidationError('endAt must be >= startAt')

  // If the caller explicitly asked for a generated meeting link, mint one.
  let meetingLink = parsed.data.meetingLink ?? null
  if (meetingLink === 'generate') {
    meetingLink = `https://meet.wistfare.com/${id}`
  }

  await db.insert(calendarEvents).values({
    id,
    userId,
    title: parsed.data.title,
    description: parsed.data.description,
    location: parsed.data.location,
    attendees: parsed.data.attendees,
    startAt,
    endAt,
    color: parsed.data.color ?? '#C5F135',
    meetingLink,
    hasWaitingRoom: parsed.data.hasWaitingRoom ?? false,
    reminderMinutes: parsed.data.reminderMinutes ?? [15],
    notes: parsed.data.notes,
    createdAt: now,
    updatedAt: now,
  })

  return c.json({ id }, 201)
})

/** PATCH /api/v1/calendar/events/:id */
calendarRoutes.patch('/events/:id', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const parsed = eventSchema.partial().safeParse(body)
  if (!parsed.success) throw new ValidationError('Invalid update')

  const db = getDb()
  const userId = c.get('userId')
  const id = c.req.param('id')
  const existing = await db
    .select()
    .from(calendarEvents)
    .where(and(eq(calendarEvents.id, id), eq(calendarEvents.userId, userId)))
    .limit(1)
  if (existing.length === 0) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Event not found' } }, 404)
  }

  const update: Record<string, unknown> = { updatedAt: new Date() }
  for (const key of Object.keys(parsed.data) as (keyof typeof parsed.data)[]) {
    const value = parsed.data[key]
    if (value === undefined) continue
    if (key === 'startAt' || key === 'endAt') {
      update[key] = new Date(value as string)
    } else {
      update[key] = value
    }
  }

  await db.update(calendarEvents).set(update).where(eq(calendarEvents.id, id))
  return c.json({ ok: true })
})

/** DELETE /api/v1/calendar/events/:id */
calendarRoutes.delete('/events/:id', async (c) => {
  const db = getDb()
  const userId = c.get('userId')
  const id = c.req.param('id')
  await db
    .delete(calendarEvents)
    .where(and(eq(calendarEvents.id, id), eq(calendarEvents.userId, userId)))
  return c.json({ ok: true })
})
