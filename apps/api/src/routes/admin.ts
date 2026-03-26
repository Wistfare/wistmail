import { Hono } from 'hono'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { ValidationError } from '@wistmail/shared'
import { generateId } from '@wistmail/shared'
import { users, organizations, orgMembers } from '@wistmail/db'
import { sessionAuth, type SessionEnv } from '../middleware/session-auth.js'
import { AuditService } from '../services/audit.js'
import { getDb } from '../lib/db.js'

export const adminRoutes = new Hono<SessionEnv>()

adminRoutes.use('*', sessionAuth)

// ── Audit Logs ──────────────────────────────────────────────────────────────

/**
 * GET /api/v1/admin/audit-logs
 */
adminRoutes.get('/audit-logs', async (c) => {
  const limit = parseInt(c.req.query('limit') || '50', 10)
  const offset = parseInt(c.req.query('offset') || '0', 10)

  const db = getDb()
  const audit = new AuditService(db)
  const logs = await audit.list({ limit, offset })

  return c.json({ data: logs, limit, offset })
})

// ── Organization ────────────────────────────────────────────────────────────

const createOrgSchema = z.object({
  name: z.string().min(2).max(255),
})

const updateOrgSchema = z.object({
  name: z.string().min(2).max(255).optional(),
})

/**
 * POST /api/v1/admin/organization
 */
adminRoutes.post('/organization', async (c) => {
  const body = await c.req.json()
  const parsed = createOrgSchema.safeParse(body)
  if (!parsed.success) {
    throw new ValidationError('Invalid input', { errors: parsed.error.flatten().fieldErrors })
  }

  const db = getDb()
  const userId = c.get('userId')
  const orgId = generateId('org')
  const slug = parsed.data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const now = new Date()

  await db.insert(organizations).values({
    id: orgId,
    name: parsed.data.name,
    slug,
    ownerId: userId,
    createdAt: now,
    updatedAt: now,
  })

  // Add owner as member
  await db.insert(orgMembers).values({
    id: generateId('mem'),
    orgId,
    userId,
    role: 'owner',
  })

  const audit = new AuditService(db)
  await audit.log({
    userId,
    action: 'organization.created',
    resource: 'organization',
    resourceId: orgId,
    details: { name: parsed.data.name },
  })

  return c.json({ id: orgId, name: parsed.data.name, slug }, 201)
})

/**
 * GET /api/v1/admin/organization
 */
adminRoutes.get('/organization', async (c) => {
  const db = getDb()
  const userId = c.get('userId')

  const result = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      ownerId: organizations.ownerId,
      logoUrl: organizations.logoUrl,
      createdAt: organizations.createdAt,
    })
    .from(organizations)
    .innerJoin(orgMembers, eq(organizations.id, orgMembers.orgId))
    .where(eq(orgMembers.userId, userId))
    .limit(1)

  if (result.length === 0) {
    return c.json({ organization: null })
  }

  return c.json({ organization: result[0] })
})

/**
 * PATCH /api/v1/admin/organization/:id
 */
adminRoutes.patch('/organization/:id', async (c) => {
  const orgId = c.req.param('id')
  const body = await c.req.json()
  const parsed = updateOrgSchema.safeParse(body)
  if (!parsed.success) {
    throw new ValidationError('Invalid input', { errors: parsed.error.flatten().fieldErrors })
  }

  const db = getDb()
  await db
    .update(organizations)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(organizations.id, orgId))

  return c.json({ ok: true })
})

// ── Members ─────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/admin/members
 */
adminRoutes.get('/members', async (c) => {
  const db = getDb()
  const userId = c.get('userId')

  // Get user's org
  const org = await db
    .select({ orgId: orgMembers.orgId })
    .from(orgMembers)
    .where(eq(orgMembers.userId, userId))
    .limit(1)

  if (org.length === 0) {
    return c.json({ data: [] })
  }

  const members = await db
    .select({
      id: orgMembers.id,
      userId: orgMembers.userId,
      role: orgMembers.role,
      name: users.name,
      email: users.email,
      avatarUrl: users.avatarUrl,
      joinedAt: orgMembers.createdAt,
    })
    .from(orgMembers)
    .innerJoin(users, eq(orgMembers.userId, users.id))
    .where(eq(orgMembers.orgId, org[0].orgId))

  return c.json({ data: members })
})

/**
 * PATCH /api/v1/admin/members/:id/role
 */
adminRoutes.patch('/members/:id/role', async (c) => {
  const memberId = c.req.param('id')
  const body = await c.req.json()
  const role = z.enum(['admin', 'member']).parse(body.role)

  const db = getDb()
  await db.update(orgMembers).set({ role }).where(eq(orgMembers.id, memberId))

  const audit = new AuditService(db)
  await audit.log({
    userId: c.get('userId'),
    action: 'member.role_changed',
    resource: 'member',
    resourceId: memberId,
    details: { newRole: role },
  })

  return c.json({ ok: true })
})

/**
 * DELETE /api/v1/admin/members/:id
 */
adminRoutes.delete('/members/:id', async (c) => {
  const memberId = c.req.param('id')
  const db = getDb()
  await db.delete(orgMembers).where(eq(orgMembers.id, memberId))

  const audit = new AuditService(db)
  await audit.log({
    userId: c.get('userId'),
    action: 'member.removed',
    resource: 'member',
    resourceId: memberId,
  })

  return c.json({ ok: true })
})
