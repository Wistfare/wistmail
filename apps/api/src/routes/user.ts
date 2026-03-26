import { Hono } from 'hono'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { ValidationError } from '@wistmail/shared'
import { users } from '@wistmail/db'
import { sessionAuth, type SessionEnv } from '../middleware/session-auth.js'
import { getDb } from '../lib/db.js'

export const userRoutes = new Hono<SessionEnv>()

userRoutes.use('*', sessionAuth)

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
