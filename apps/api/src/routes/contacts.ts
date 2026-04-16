import { Hono } from 'hono'
import { eq, and } from 'drizzle-orm'
import { NotFoundError, ValidationError } from '@wistmail/shared'
import { contacts } from '@wistmail/db'
import { dualAuth, requireScope, type DualAuthEnv } from '../middleware/dual-auth.js'
import { updateContactSchema } from '../lib/validation.js'
import { getDb } from '../lib/db.js'

/**
 * Mounted at /api/v1/contacts.
 * Used by the SDK's `wm.audiences.updateContact()` / `deleteContact()`.
 */
export const contactRoutes = new Hono<DualAuthEnv>()

contactRoutes.use('*', dualAuth)

/**
 * PATCH /api/v1/contacts/:id
 */
contactRoutes.patch('/:id', requireScope('contacts:manage'), async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  const parsed = updateContactSchema.safeParse(body)
  if (!parsed.success) {
    throw new ValidationError('Invalid request body', { errors: parsed.error.flatten().fieldErrors })
  }

  const db = getDb()
  const userId = c.get('userId')

  const existing = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.id, id), eq(contacts.userId, userId)))
    .limit(1)

  if (existing.length === 0) throw new NotFoundError('Contact', id)

  const updates: Record<string, unknown> = { updatedAt: new Date() }
  if (parsed.data.name !== undefined) updates.name = parsed.data.name
  if (parsed.data.metadata !== undefined) updates.metadata = parsed.data.metadata

  await db.update(contacts).set(updates).where(eq(contacts.id, id))

  const updated = await db.select().from(contacts).where(eq(contacts.id, id)).limit(1)

  return c.json({
    id: updated[0].id,
    email: updated[0].email,
    name: updated[0].name,
    metadata: updated[0].metadata,
    updatedAt: updated[0].updatedAt,
  })
})

/**
 * DELETE /api/v1/contacts/:id
 */
contactRoutes.delete('/:id', requireScope('contacts:manage'), async (c) => {
  const id = c.req.param('id')
  const db = getDb()
  const userId = c.get('userId')

  const existing = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.id, id), eq(contacts.userId, userId)))
    .limit(1)

  if (existing.length === 0) throw new NotFoundError('Contact', id)

  await db.delete(contacts).where(eq(contacts.id, id))
  return c.json({ ok: true })
})
