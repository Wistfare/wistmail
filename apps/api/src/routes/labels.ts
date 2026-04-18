import { Hono } from 'hono'
import { z } from 'zod'
import { and, eq, inArray } from 'drizzle-orm'
import { ValidationError, generateId } from '@wistmail/shared'
import { labels, emailLabels, emails, mailboxes } from '@wistmail/db'
import { sessionAuth, type SessionEnv } from '../middleware/session-auth.js'
import { getDb } from '../lib/db.js'

export const labelRoutes = new Hono<SessionEnv>()
labelRoutes.use('*', sessionAuth)

async function getUserMailboxIds(userId: string): Promise<string[]> {
  const db = getDb()
  const rows = await db
    .select({ id: mailboxes.id })
    .from(mailboxes)
    .where(eq(mailboxes.userId, userId))
  return rows.map((r) => r.id)
}

/** GET /api/v1/labels — list all labels across the user's mailboxes. */
labelRoutes.get('/', async (c) => {
  const userId = c.get('userId')
  const mailboxIds = await getUserMailboxIds(userId)
  if (mailboxIds.length === 0) return c.json({ labels: [] })

  const db = getDb()
  const rows = await db
    .select()
    .from(labels)
    .where(inArray(labels.mailboxId, mailboxIds))

  return c.json({ labels: rows })
})

/** POST /api/v1/labels  { name, color?, mailboxId } */
labelRoutes.post('/', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const schema = z.object({
    name: z.string().min(1).max(255),
    color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#999999'),
    mailboxId: z.string(),
  })
  const parsed = schema.safeParse(body)
  if (!parsed.success) throw new ValidationError('Invalid label')

  const userId = c.get('userId')
  const mailboxIds = await getUserMailboxIds(userId)
  if (!mailboxIds.includes(parsed.data.mailboxId)) {
    throw new ValidationError('Invalid mailbox')
  }

  const db = getDb()
  const id = generateId('lbl')
  await db.insert(labels).values({
    id,
    name: parsed.data.name,
    color: parsed.data.color,
    mailboxId: parsed.data.mailboxId,
  })
  return c.json({ id }, 201)
})

/** PATCH /api/v1/labels/:id  { name?, color? } */
labelRoutes.patch('/:id', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const schema = z.object({
    name: z.string().min(1).max(255).optional(),
    color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  })
  const parsed = schema.safeParse(body)
  if (!parsed.success) throw new ValidationError('Invalid input')

  const db = getDb()
  const labelId = c.req.param('id')
  const userId = c.get('userId')

  const row = await db
    .select({ mailboxId: labels.mailboxId })
    .from(labels)
    .where(eq(labels.id, labelId))
    .limit(1)
  if (row.length === 0) return c.json({ error: { code: 'NOT_FOUND', message: 'Label not found' } }, 404)

  const mailboxIds = await getUserMailboxIds(userId)
  if (!mailboxIds.includes(row[0].mailboxId)) {
    return c.json({ error: { code: 'FORBIDDEN', message: 'Not your label' } }, 403)
  }

  const update: Record<string, unknown> = {}
  if (parsed.data.name !== undefined) update.name = parsed.data.name
  if (parsed.data.color !== undefined) update.color = parsed.data.color
  if (Object.keys(update).length > 0) {
    await db.update(labels).set(update).where(eq(labels.id, labelId))
  }
  return c.json({ ok: true })
})

/** DELETE /api/v1/labels/:id */
labelRoutes.delete('/:id', async (c) => {
  const db = getDb()
  const labelId = c.req.param('id')
  const userId = c.get('userId')

  const row = await db
    .select({ mailboxId: labels.mailboxId })
    .from(labels)
    .where(eq(labels.id, labelId))
    .limit(1)
  if (row.length === 0) return c.json({ ok: true })

  const mailboxIds = await getUserMailboxIds(userId)
  if (!mailboxIds.includes(row[0].mailboxId)) {
    return c.json({ error: { code: 'FORBIDDEN', message: 'Not your label' } }, 403)
  }

  await db.delete(labels).where(eq(labels.id, labelId))
  return c.json({ ok: true })
})

/** GET /api/v1/labels/email/:emailId — labels applied to an email. */
labelRoutes.get('/email/:emailId', async (c) => {
  const db = getDb()
  const emailId = c.req.param('emailId')
  const userId = c.get('userId')

  const emailRow = await db
    .select({ mailboxId: emails.mailboxId })
    .from(emails)
    .innerJoin(mailboxes, eq(mailboxes.id, emails.mailboxId))
    .where(and(eq(emails.id, emailId), eq(mailboxes.userId, userId)))
    .limit(1)
  if (emailRow.length === 0) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Email not found' } }, 404)
  }

  const assigned = await db
    .select({
      id: labels.id,
      name: labels.name,
      color: labels.color,
    })
    .from(emailLabels)
    .innerJoin(labels, eq(labels.id, emailLabels.labelId))
    .where(eq(emailLabels.emailId, emailId))

  return c.json({ labels: assigned })
})

/** PUT /api/v1/labels/email/:emailId  { labelIds: string[] } — replace assignments. */
labelRoutes.put('/email/:emailId', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const schema = z.object({ labelIds: z.array(z.string()) })
  const parsed = schema.safeParse(body)
  if (!parsed.success) throw new ValidationError('Invalid labelIds')

  const db = getDb()
  const emailId = c.req.param('emailId')
  const userId = c.get('userId')

  const emailRow = await db
    .select({ mailboxId: emails.mailboxId })
    .from(emails)
    .innerJoin(mailboxes, eq(mailboxes.id, emails.mailboxId))
    .where(and(eq(emails.id, emailId), eq(mailboxes.userId, userId)))
    .limit(1)
  if (emailRow.length === 0) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Email not found' } }, 404)
  }

  // Verify every labelId belongs to the user's mailboxes.
  if (parsed.data.labelIds.length > 0) {
    const labelRows = await db
      .select({ id: labels.id, mailboxId: labels.mailboxId })
      .from(labels)
      .where(inArray(labels.id, parsed.data.labelIds))
    const mailboxIds = await getUserMailboxIds(userId)
    for (const row of labelRows) {
      if (!mailboxIds.includes(row.mailboxId)) {
        throw new ValidationError('One or more labels are not yours')
      }
    }
    if (labelRows.length !== parsed.data.labelIds.length) {
      throw new ValidationError('One or more labelIds not found')
    }
  }

  await db.delete(emailLabels).where(eq(emailLabels.emailId, emailId))
  if (parsed.data.labelIds.length > 0) {
    await db
      .insert(emailLabels)
      .values(parsed.data.labelIds.map((labelId) => ({ emailId, labelId })))
  }

  return c.json({ ok: true })
})
