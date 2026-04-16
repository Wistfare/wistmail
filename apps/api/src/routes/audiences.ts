import { Hono } from 'hono'
import { eq, and, sql } from 'drizzle-orm'
import { generateId, NotFoundError, ValidationError } from '@wistmail/shared'
import { audiences, audienceContacts, contacts } from '@wistmail/db'
import { dualAuth, requireScope, type DualAuthEnv } from '../middleware/dual-auth.js'
import { createAudienceSchema, createContactSchema } from '../lib/validation.js'
import { getDb } from '../lib/db.js'

export const audienceRoutes = new Hono<DualAuthEnv>()

audienceRoutes.use('*', dualAuth)

/**
 * POST /api/v1/audiences — Create an audience.
 */
audienceRoutes.post('/', requireScope('contacts:manage'), async (c) => {
  const body = await c.req.json()
  const parsed = createAudienceSchema.safeParse(body)
  if (!parsed.success) {
    throw new ValidationError('Invalid request body', { errors: parsed.error.flatten().fieldErrors })
  }

  const db = getDb()
  const userId = c.get('userId')
  const audienceId = generateId('aud')
  const now = new Date()

  await db.insert(audiences).values({
    id: audienceId,
    name: parsed.data.name,
    userId,
    contactCount: 0,
    createdAt: now,
  })

  return c.json({
    id: audienceId,
    name: parsed.data.name,
    contactCount: 0,
    createdAt: now.toISOString(),
  }, 201)
})

/**
 * GET /api/v1/audiences — List audiences.
 */
audienceRoutes.get('/', requireScope('contacts:manage'), async (c) => {
  const db = getDb()
  const userId = c.get('userId')

  const rows = await db.select().from(audiences).where(eq(audiences.userId, userId))

  return c.json({
    data: rows.map((a) => ({
      id: a.id,
      name: a.name,
      contactCount: a.contactCount,
      createdAt: a.createdAt,
    })),
    total: rows.length,
    page: 1,
    pageSize: rows.length,
    hasMore: false,
  })
})

/**
 * GET /api/v1/audiences/:id — Get a single audience.
 */
audienceRoutes.get('/:id', requireScope('contacts:manage'), async (c) => {
  const id = c.req.param('id')
  const db = getDb()
  const userId = c.get('userId')

  const result = await db
    .select()
    .from(audiences)
    .where(and(eq(audiences.id, id), eq(audiences.userId, userId)))
    .limit(1)

  if (result.length === 0) throw new NotFoundError('Audience', id)

  const a = result[0]
  return c.json({
    id: a.id,
    name: a.name,
    contactCount: a.contactCount,
    createdAt: a.createdAt,
  })
})

/**
 * DELETE /api/v1/audiences/:id — Delete an audience.
 */
audienceRoutes.delete('/:id', requireScope('contacts:manage'), async (c) => {
  const id = c.req.param('id')
  const db = getDb()
  const userId = c.get('userId')

  await db.delete(audiences).where(and(eq(audiences.id, id), eq(audiences.userId, userId)))
  return c.json({ ok: true })
})

/**
 * POST /api/v1/audiences/:id/contacts — Add a contact to an audience.
 */
audienceRoutes.post('/:id/contacts', requireScope('contacts:manage'), async (c) => {
  const audienceId = c.req.param('id')
  const body = await c.req.json()
  const parsed = createContactSchema.safeParse(body)
  if (!parsed.success) {
    throw new ValidationError('Invalid request body', { errors: parsed.error.flatten().fieldErrors })
  }

  const db = getDb()
  const userId = c.get('userId')

  // Verify audience ownership
  const audRes = await db.select().from(audiences).where(and(eq(audiences.id, audienceId), eq(audiences.userId, userId))).limit(1)
  if (audRes.length === 0) throw new NotFoundError('Audience', audienceId)

  // Reuse or create contact by email
  const existing = await db.select().from(contacts).where(and(eq(contacts.email, parsed.data.email), eq(contacts.userId, userId))).limit(1)

  let contactId: string
  const now = new Date()

  if (existing.length > 0) {
    contactId = existing[0].id
    if (parsed.data.name) {
      await db.update(contacts).set({ name: parsed.data.name, updatedAt: now }).where(eq(contacts.id, contactId))
    }
  } else {
    contactId = generateId('con')
    await db.insert(contacts).values({
      id: contactId,
      email: parsed.data.email,
      name: parsed.data.name || null,
      userId,
      metadata: parsed.data.metadata || {},
      createdAt: now,
      updatedAt: now,
    })
  }

  // Add to audience (idempotent)
  try {
    await db.insert(audienceContacts).values({
      audienceId,
      contactId,
      subscribedAt: now,
      topics: parsed.data.topics || [],
    })
    await db
      .update(audiences)
      .set({ contactCount: sql`${audiences.contactCount} + 1` })
      .where(eq(audiences.id, audienceId))
  } catch {
    // already subscribed
  }

  return c.json({
    id: contactId,
    audienceId,
    email: parsed.data.email,
    name: parsed.data.name || null,
    metadata: parsed.data.metadata || {},
    topics: parsed.data.topics || [],
    createdAt: now.toISOString(),
  }, 201)
})

/**
 * GET /api/v1/audiences/:id/contacts — List contacts in an audience (paginated).
 */
audienceRoutes.get('/:id/contacts', requireScope('contacts:manage'), async (c) => {
  const audienceId = c.req.param('id')
  const page = Math.max(1, parseInt(c.req.query('page') || '1', 10))
  const pageSize = Math.min(100, Math.max(1, parseInt(c.req.query('pageSize') || '25', 10)))

  const db = getDb()
  const userId = c.get('userId')

  // Verify audience ownership
  const audRes = await db.select().from(audiences).where(and(eq(audiences.id, audienceId), eq(audiences.userId, userId))).limit(1)
  if (audRes.length === 0) throw new NotFoundError('Audience', audienceId)

  const offset = (page - 1) * pageSize
  const rows = await db
    .select({
      id: contacts.id,
      email: contacts.email,
      name: contacts.name,
      metadata: contacts.metadata,
      topics: audienceContacts.topics,
      subscribedAt: audienceContacts.subscribedAt,
    })
    .from(audienceContacts)
    .innerJoin(contacts, eq(audienceContacts.contactId, contacts.id))
    .where(eq(audienceContacts.audienceId, audienceId))
    .limit(pageSize)
    .offset(offset)

  const total = audRes[0].contactCount

  return c.json({
    data: rows.map((r) => ({
      id: r.id,
      audienceId,
      email: r.email,
      name: r.name,
      metadata: r.metadata,
      topics: r.topics,
      subscribedAt: r.subscribedAt,
    })),
    total,
    page,
    pageSize,
    hasMore: offset + rows.length < total,
  })
})
