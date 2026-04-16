import { Hono } from 'hono'
import { eq, and, desc } from 'drizzle-orm'
import { generateId, generateWebhookSecret, NotFoundError, ValidationError } from '@wistmail/shared'
import { webhooks, webhookLogs } from '@wistmail/db'
import { dualAuth, requireScope, type DualAuthEnv } from '../middleware/dual-auth.js'
import { getDb } from '../lib/db.js'

export const webhookRoutes = new Hono<DualAuthEnv>()

// Webhook management works via API key (SDK) OR session cookie (dashboard)
webhookRoutes.use('*', dualAuth)
webhookRoutes.use('*', requireScope('webhooks:manage'))

const VALID_EVENTS = [
  'email.sent', 'email.delivered', 'email.bounced',
  'email.opened', 'email.clicked', 'email.failed', 'email.received',
]

/**
 * POST /api/v1/webhooks
 */
webhookRoutes.post('/', async (c) => {
  const body = await c.req.json()
  const url = body.url?.trim()
  const events = body.events || []

  if (!url || !url.startsWith('http')) {
    throw new ValidationError('Valid URL is required')
  }
  if (!Array.isArray(events) || events.length === 0) {
    throw new ValidationError('At least one event type is required')
  }
  for (const evt of events) {
    if (!VALID_EVENTS.includes(evt)) {
      throw new ValidationError(`Invalid event type: ${evt}`)
    }
  }

  const db = getDb()
  const userId = c.get('userId')
  const webhookId = generateId('whk')
  const secret = generateWebhookSecret()
  const now = new Date()

  await db.insert(webhooks).values({
    id: webhookId,
    url,
    events,
    secret,
    userId,
    active: true,
    createdAt: now,
  })

  return c.json({
    id: webhookId,
    url,
    events,
    secret, // Returned once on creation
    active: true,
    createdAt: now.toISOString(),
  }, 201)
})

/**
 * GET /api/v1/webhooks
 */
webhookRoutes.get('/', async (c) => {
  const db = getDb()
  const userId = c.get('userId')

  const result = await db
    .select({
      id: webhooks.id,
      url: webhooks.url,
      events: webhooks.events,
      secret: webhooks.secret,
      active: webhooks.active,
      createdAt: webhooks.createdAt,
    })
    .from(webhooks)
    .where(eq(webhooks.userId, userId))

  return c.json({ data: result })
})

/**
 * GET /api/v1/webhooks/:id
 * Includes recent delivery logs.
 */
webhookRoutes.get('/:id', async (c) => {
  const id = c.req.param('id')
  const userId = c.get('userId')
  const db = getDb()

  const result = await db
    .select()
    .from(webhooks)
    .where(and(eq(webhooks.id, id), eq(webhooks.userId, userId)))
    .limit(1)

  if (result.length === 0) throw new NotFoundError('Webhook', id)

  const logs = await db
    .select()
    .from(webhookLogs)
    .where(eq(webhookLogs.webhookId, id))
    .orderBy(desc(webhookLogs.createdAt))
    .limit(20)

  return c.json({ webhook: result[0], logs })
})

/**
 * PATCH /api/v1/webhooks/:id
 */
webhookRoutes.patch('/:id', async (c) => {
  const id = c.req.param('id')
  const userId = c.get('userId')
  const body = await c.req.json()
  const db = getDb()

  const existing = await db
    .select()
    .from(webhooks)
    .where(and(eq(webhooks.id, id), eq(webhooks.userId, userId)))
    .limit(1)

  if (existing.length === 0) throw new NotFoundError('Webhook', id)

  const updates: Record<string, unknown> = {}
  if (body.url) updates.url = body.url
  if (body.events) updates.events = body.events
  if (body.active !== undefined) updates.active = body.active

  if (Object.keys(updates).length > 0) {
    await db.update(webhooks).set(updates).where(eq(webhooks.id, id))
  }

  return c.json({ ok: true })
})

/**
 * DELETE /api/v1/webhooks/:id
 */
webhookRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const userId = c.get('userId')
  const db = getDb()

  await db.delete(webhooks).where(and(eq(webhooks.id, id), eq(webhooks.userId, userId)))
  return c.json({ ok: true })
})
