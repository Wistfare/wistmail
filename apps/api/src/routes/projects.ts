import { Hono } from 'hono'
import { z } from 'zod'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { ValidationError, generateId } from '@wistmail/shared'
import { docs, projects, projectTasks } from '@wistmail/db'
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

/**
 * GET /api/v1/projects?status=active
 *
 * The Work screen renders a progress bar per project, so we join
 * `project_tasks` aggregates and compute `doneCount` / `totalCount`
 * server-side. `progress` (the denormalized column) is kept as a
 * fallback for projects without tasks yet (manual % input).
 */
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

  if (rows.length === 0) return c.json({ projects: [] })

  const ids = rows.map((r) => r.id)
  const taskCounts = await db
    .select({
      projectId: projectTasks.projectId,
      total: sql<number>`count(*)::int`,
      done: sql<number>`count(*) filter (where ${projectTasks.status} = 'done')::int`,
    })
    .from(projectTasks)
    .where(inArray(projectTasks.projectId, ids))
    .groupBy(projectTasks.projectId)
  const byId = new Map(taskCounts.map((t) => [t.projectId, t]))

  return c.json({
    projects: rows.map((p) => {
      const c = byId.get(p.id)
      const computedProgress =
        c && c.total > 0 ? Math.round((c.done / c.total) * 100) : p.progress
      return {
        ...p,
        taskTotal: c?.total ?? 0,
        taskDone: c?.done ?? 0,
        progress: computedProgress,
      }
    }),
  })
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

/**
 * GET /api/v1/projects/:id/progress
 *
 * Live task aggregate for a single project. Used when tapping into
 * a project from the Work screen; the list endpoint already inlines
 * these counts so the list view doesn't N+1.
 */
projectRoutes.get('/:id/progress', async (c) => {
  const db = getDb()
  const userId = c.get('userId')
  const id = c.req.param('id')

  // Ownership check (cheap: PK lookup).
  const owned = await db
    .select({ id: projects.id, progress: projects.progress })
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.ownerId, userId)))
    .limit(1)
  if (owned.length === 0) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Project not found' } }, 404)
  }

  const [counts] = await db
    .select({
      total: sql<number>`count(*)::int`,
      done: sql<number>`count(*) filter (where ${projectTasks.status} = 'done')::int`,
      inProgress: sql<number>`count(*) filter (where ${projectTasks.status} = 'in_progress')::int`,
    })
    .from(projectTasks)
    .where(eq(projectTasks.projectId, id))

  const total = counts?.total ?? 0
  const done = counts?.done ?? 0
  const computed = total > 0 ? Math.round((done / total) * 100) : owned[0].progress

  return c.json({
    projectId: id,
    total,
    done,
    inProgress: counts?.inProgress ?? 0,
    progress: computed,
  })
})

/** GET /api/v1/projects/:id/tasks */
projectRoutes.get('/:id/tasks', async (c) => {
  const db = getDb()
  const userId = c.get('userId')
  const id = c.req.param('id')

  const owned = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.ownerId, userId)))
    .limit(1)
  if (owned.length === 0) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Project not found' } }, 404)
  }

  const rows = await db
    .select()
    .from(projectTasks)
    .where(eq(projectTasks.projectId, id))
    .orderBy(desc(projectTasks.updatedAt))
  return c.json({ tasks: rows })
})

const taskSchema = z.object({
  title: z.string().min(1).max(500),
  status: z.enum(['todo', 'in_progress', 'done']).optional(),
  assigneeId: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
})

/** POST /api/v1/projects/:id/tasks */
projectRoutes.post('/:id/tasks', async (c) => {
  const db = getDb()
  const userId = c.get('userId')
  const projectId = c.req.param('id')
  const body = await c.req.json().catch(() => ({}))
  const parsed = taskSchema.safeParse(body)
  if (!parsed.success) {
    throw new ValidationError('Invalid task', { errors: parsed.error.flatten().fieldErrors })
  }

  const owned = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.ownerId, userId)))
    .limit(1)
  if (owned.length === 0) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Project not found' } }, 404)
  }

  const id = generateId('tsk')
  const now = new Date()
  await db.insert(projectTasks).values({
    id,
    projectId,
    title: parsed.data.title,
    status: parsed.data.status ?? 'todo',
    assigneeId: parsed.data.assigneeId ?? null,
    dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
    createdAt: now,
    updatedAt: now,
  })
  return c.json({ id }, 201)
})

/** PATCH /api/v1/projects/:projectId/tasks/:taskId */
projectRoutes.patch('/:projectId/tasks/:taskId', async (c) => {
  const db = getDb()
  const userId = c.get('userId')
  const { projectId, taskId } = c.req.param()
  const body = await c.req.json().catch(() => ({}))
  const parsed = taskSchema.partial().safeParse(body)
  if (!parsed.success) throw new ValidationError('Invalid update')

  // Ownership: project must belong to user AND task must belong to project.
  const owned = await db
    .select({ id: projectTasks.id })
    .from(projectTasks)
    .innerJoin(projects, eq(projects.id, projectTasks.projectId))
    .where(
      and(
        eq(projectTasks.id, taskId),
        eq(projectTasks.projectId, projectId),
        eq(projects.ownerId, userId),
      ),
    )
    .limit(1)
  if (owned.length === 0) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Task not found' } }, 404)
  }

  const update: Record<string, unknown> = { updatedAt: new Date() }
  for (const key of Object.keys(parsed.data) as (keyof typeof parsed.data)[]) {
    const value = parsed.data[key]
    if (value === undefined) continue
    if (key === 'dueDate') update[key] = value ? new Date(value as string) : null
    else update[key] = value
  }
  await db.update(projectTasks).set(update).where(eq(projectTasks.id, taskId))
  return c.json({ ok: true })
})

/**
 * GET /api/v1/projects/docs/recent?limit=10
 *
 * Work screen "Recent docs" block. Returns recently-touched docs across
 * the user's projects. Stub-level for now (table exists, full editor
 * lives in a later phase) but the endpoint contract is in place so the
 * mobile side doesn't have to change when the feature ships.
 */
projectRoutes.get('/docs/recent', async (c) => {
  const db = getDb()
  const userId = c.get('userId')
  const limit = Math.min(parseInt(c.req.query('limit') || '10', 10), 50)
  const rows = await db
    .select({
      id: docs.id,
      title: docs.title,
      icon: docs.icon,
      projectId: docs.projectId,
      updatedAt: docs.updatedAt,
    })
    .from(docs)
    .where(eq(docs.ownerId, userId))
    .orderBy(desc(docs.updatedAt))
    .limit(limit)

  // Enrich with project name for the Work list row subtitle.
  const projectIds = Array.from(
    new Set(rows.map((r) => r.projectId).filter((id): id is string => !!id)),
  )
  const projectRows =
    projectIds.length === 0
      ? []
      : await db
          .select({ id: projects.id, name: projects.name })
          .from(projects)
          .where(inArray(projects.id, projectIds))
  const nameById = new Map(projectRows.map((p) => [p.id, p.name]))

  return c.json({
    docs: rows.map((d) => ({
      id: d.id,
      title: d.title,
      icon: d.icon,
      projectId: d.projectId,
      projectName: d.projectId ? nameById.get(d.projectId) ?? null : null,
      updatedAt: d.updatedAt,
    })),
  })
})
