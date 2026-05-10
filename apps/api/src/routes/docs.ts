import { Hono } from 'hono'
import { z } from 'zod'
import { and, asc, desc, eq, isNull } from 'drizzle-orm'
import { ValidationError, generateId } from '@wistmail/shared'
import { docs, docComments } from '@wistmail/db'
import { sessionAuth, type SessionEnv } from '../middleware/session-auth.js'
import { getDb } from '../lib/db.js'

/**
 * V3 Docs CRUD routes — promote the legacy stub table into a fully
 * editable doc surface.
 *
 * Each row stores `{ id, ownerId, projectId?, title, icon?, body? }`
 * and the editor at `/docs/[id]` reads + writes via these endpoints.
 *
 * Note: there's a separate `GET /api/v1/projects/docs/recent` over in
 * `routes/projects.ts` that the WorkV3 page uses for the "recent docs"
 * block. Keeping that one untouched — this file is the canonical
 * docs surface.
 */
export const docsRoutes = new Hono<SessionEnv>()
docsRoutes.use('*', sessionAuth)

const upsertSchema = z.object({
  title: z.string().min(1).max(500),
  icon: z.string().max(32).nullable().optional(),
  body: z.string().nullable().optional(),
  projectId: z.string().max(64).nullable().optional(),
  status: z.enum(['draft', 'in_review', 'published']).optional(),
})

const patchSchema = upsertSchema.partial()
const commentSchema = z.object({
  body: z.string().min(1).max(5000),
})

/** GET /api/v1/docs?projectId=... — list user's docs (most recent first). */
docsRoutes.get('/', async (c) => {
  const userId = c.get('userId')
  const projectId = c.req.query('projectId')

  const db = getDb()
  const conditions = [eq(docs.ownerId, userId)]
  if (projectId) conditions.push(eq(docs.projectId, projectId))

  // The list view only needs the index-level metadata (title, icon,
  // status, project, timestamps). `body` is a `text` column that can
  // be tens-of-KB per doc once the user fills it in — shipping it
  // for every row would balloon the payload and the SQL row size for
  // no reason. The single-doc endpoint (GET /docs/:id) keeps the
  // full select for the editor.
  const rows = await db
    .select({
      id: docs.id,
      ownerId: docs.ownerId,
      projectId: docs.projectId,
      title: docs.title,
      icon: docs.icon,
      status: docs.status,
      shareToken: docs.shareToken,
      updatedAt: docs.updatedAt,
      createdAt: docs.createdAt,
    })
    .from(docs)
    .where(and(...conditions))
    .orderBy(desc(docs.updatedAt))

  return c.json({ docs: rows })
})

/** GET /api/v1/docs/:id — fetch a single doc with its body. */
docsRoutes.get('/:id', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const db = getDb()
  const row = await db
    .select()
    .from(docs)
    .where(and(eq(docs.id, id), eq(docs.ownerId, userId)))
    .limit(1)
  if (row.length === 0) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Doc not found' } }, 404)
  }
  return c.json(row[0])
})

/** POST /api/v1/docs — create. Body fields default to empty so the
 *  editor can navigate to the new id immediately. */
docsRoutes.post('/', async (c) => {
  const userId = c.get('userId')
  const parsed = upsertSchema.safeParse(await c.req.json())
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid doc')
  }

  const db = getDb()
  const id = generateId('doc_')
  const now = new Date()
  const inserted = await db
    .insert(docs)
    .values({
      id,
      ownerId: userId,
      projectId: parsed.data.projectId ?? null,
      title: parsed.data.title,
      icon: parsed.data.icon ?? null,
      body: parsed.data.body ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
  return c.json(inserted[0], 201)
})

/** PATCH /api/v1/docs/:id — update title / icon / body / projectId. */
docsRoutes.patch('/:id', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const parsed = patchSchema.safeParse(await c.req.json())
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid patch')
  }
  const fields = parsed.data
  if (Object.keys(fields).length === 0) {
    throw new ValidationError('At least one field required')
  }

  const db = getDb()
  const updated = await db
    .update(docs)
    .set({
      ...(fields.title !== undefined ? { title: fields.title } : {}),
      ...(fields.icon !== undefined ? { icon: fields.icon } : {}),
      ...(fields.body !== undefined ? { body: fields.body } : {}),
      ...(fields.projectId !== undefined ? { projectId: fields.projectId } : {}),
      ...(fields.status !== undefined ? { status: fields.status } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(docs.id, id), eq(docs.ownerId, userId)))
    .returning()

  if (updated.length === 0) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Doc not found' } }, 404)
  }
  return c.json(updated[0])
})

/** DELETE /api/v1/docs/:id — hard delete. */
docsRoutes.delete('/:id', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const db = getDb()
  await db.delete(docs).where(and(eq(docs.id, id), eq(docs.ownerId, userId)))
  return c.json({ ok: true })
})

/**
 * POST /api/v1/docs/:id/share — issue or rotate a share token. Returns
 * `{ shareToken }`. Owner-only; anyone with the token can later read the
 * doc via a separate `GET /api/v1/docs/share/:token` endpoint (not yet
 * shipped — the column lands first).
 */
docsRoutes.post('/:id/share', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const db = getDb()
  const token = generateId('share_').slice(0, 48)
  const updated = await db
    .update(docs)
    .set({ shareToken: token, updatedAt: new Date() })
    .where(and(eq(docs.id, id), eq(docs.ownerId, userId)))
    .returning()
  if (updated.length === 0) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Doc not found' } }, 404)
  }
  return c.json({ shareToken: token })
})

/** DELETE /api/v1/docs/:id/share — revoke a share link. */
docsRoutes.delete('/:id/share', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const db = getDb()
  await db
    .update(docs)
    .set({ shareToken: null, updatedAt: new Date() })
    .where(and(eq(docs.id, id), eq(docs.ownerId, userId)))
  return c.json({ ok: true })
})

/** GET /api/v1/docs/:id/comments — list comments oldest-first. */
docsRoutes.get('/:id/comments', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const db = getDb()
  // Verify doc ownership before exposing comments.
  const doc = await db
    .select()
    .from(docs)
    .where(and(eq(docs.id, id), eq(docs.ownerId, userId)))
    .limit(1)
  if (doc.length === 0) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Doc not found' } }, 404)
  }
  const rows = await db
    .select()
    .from(docComments)
    .where(and(eq(docComments.docId, id), isNull(docComments.deletedAt)))
    .orderBy(asc(docComments.createdAt))
  return c.json({ comments: rows })
})

/** POST /api/v1/docs/:id/comments — append a comment. */
docsRoutes.post('/:id/comments', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const parsed = commentSchema.safeParse(await c.req.json())
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid comment')
  }
  const db = getDb()
  const doc = await db
    .select()
    .from(docs)
    .where(and(eq(docs.id, id), eq(docs.ownerId, userId)))
    .limit(1)
  if (doc.length === 0) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Doc not found' } }, 404)
  }
  const inserted = await db
    .insert(docComments)
    .values({
      id: generateId('cmt_'),
      docId: id,
      authorId: userId,
      body: parsed.data.body,
    })
    .returning()
  return c.json(inserted[0], 201)
})

/** DELETE /api/v1/docs/comments/:commentId — soft-delete a comment. */
docsRoutes.delete('/comments/:commentId', async (c) => {
  const userId = c.get('userId')
  const commentId = c.req.param('commentId')
  const db = getDb()
  await db
    .update(docComments)
    .set({ deletedAt: new Date() })
    .where(and(eq(docComments.id, commentId), eq(docComments.authorId, userId)))
  return c.json({ ok: true })
})
