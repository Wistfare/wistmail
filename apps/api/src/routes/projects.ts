import { Hono } from 'hono'
import { z } from 'zod'
import { and, desc, eq } from 'drizzle-orm'
import { ValidationError, generateId } from '@wistmail/shared'
import { projects } from '@wistmail/db'
import { sessionAuth, type SessionEnv } from '../middleware/session-auth.js'
import { getDb } from '../lib/db.js'

export const projectRoutes = new Hono<SessionEnv>()
projectRoutes.use('*', sessionAuth)

const projectSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(5000).optional(),
  memberUserIds: z.array(z.string()).default([]),
  dueDate: z.string().nullable().optional(),
  status: z.enum(['active', 'completed', 'archived']).optional(),
  progress: z.number().int().min(0).max(100).optional(),
})

/** GET /api/v1/projects?status=active */
projectRoutes.get('/', async (c) => {
  const userId = c.get('userId')
  const status = c.req.query('status')
  const db = getDb()
  const conditions = [eq(projects.ownerId, userId)]
  if (status) conditions.push(eq(projects.status, status))

  const rows = await db
    .select()
    .from(projects)
    .where(and(...conditions))
    .orderBy(desc(projects.updatedAt))

  return c.json({ projects: rows })
})

/** POST /api/v1/projects */
projectRoutes.post('/', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const parsed = projectSchema.safeParse(body)
  if (!parsed.success) {
    throw new ValidationError('Invalid project', { errors: parsed.error.flatten().fieldErrors })
  }

  const userId = c.get('userId')
  const db = getDb()
  const id = generateId('prj')
  const now = new Date()

  await db.insert(projects).values({
    id,
    ownerId: userId,
    name: parsed.data.name,
    description: parsed.data.description,
    memberUserIds: parsed.data.memberUserIds,
    dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
    status: parsed.data.status ?? 'active',
    progress: parsed.data.progress ?? 0,
    createdAt: now,
    updatedAt: now,
  })

  return c.json({ id }, 201)
})

/** GET /api/v1/projects/:id */
projectRoutes.get('/:id', async (c) => {
  const db = getDb()
  const userId = c.get('userId')
  const id = c.req.param('id')
  const row = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.ownerId, userId)))
    .limit(1)
  if (row.length === 0) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Project not found' } }, 404)
  }
  return c.json(row[0])
})

/** PATCH /api/v1/projects/:id */
projectRoutes.patch('/:id', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const parsed = projectSchema.partial().safeParse(body)
  if (!parsed.success) throw new ValidationError('Invalid update')

  const db = getDb()
  const userId = c.get('userId')
  const id = c.req.param('id')

  const update: Record<string, unknown> = { updatedAt: new Date() }
  for (const key of Object.keys(parsed.data) as (keyof typeof parsed.data)[]) {
    const value = parsed.data[key]
    if (value === undefined) continue
    if (key === 'dueDate') {
      update[key] = value ? new Date(value as string) : null
    } else {
      update[key] = value
    }
  }

  await db
    .update(projects)
    .set(update)
    .where(and(eq(projects.id, id), eq(projects.ownerId, userId)))
  return c.json({ ok: true })
})

/** DELETE /api/v1/projects/:id */
projectRoutes.delete('/:id', async (c) => {
  const db = getDb()
  const userId = c.get('userId')
  const id = c.req.param('id')
  await db
    .delete(projects)
    .where(and(eq(projects.id, id), eq(projects.ownerId, userId)))
  return c.json({ ok: true })
})
