import { Hono } from 'hono'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { hash } from 'argon2'
import { randomBytes } from 'node:crypto'
import { ValidationError } from '@wistmail/shared'
import { generateId } from '@wistmail/shared'
import { users, organizations, orgMembers, mailboxes, domains } from '@wistmail/db'
import { sessionAuth, type SessionEnv } from '../middleware/session-auth.js'
import { AuditService } from '../services/audit.js'
import { getDb } from '../lib/db.js'
import { buildInvitationEmail } from '../templates/invitation.js'

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

// ── Create User ────────────────────────────────────────────────────────────

const createUserSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().max(100).default(''),
  externalEmail: z.string().email('Invalid external email').optional().or(z.literal('')),
  emailLocal: z.string().min(1).max(64).regex(/^[a-zA-Z0-9._%+-]+$/, 'Invalid email characters'),
  displayName: z.string().min(1).max(255),
})

/**
 * POST /api/v1/admin/users/create
 * Creates a new user, mailbox, and sends invitation to their external email.
 */
adminRoutes.post('/users/create', async (c) => {
  const body = await c.req.json()
  const parsed = createUserSchema.safeParse(body)
  if (!parsed.success) {
    throw new ValidationError('Invalid input', { errors: parsed.error.flatten().fieldErrors })
  }

  const db = getDb()
  const adminUserId = c.get('userId')
  const { firstName, lastName, externalEmail, emailLocal, displayName } = parsed.data

  // Get admin's org
  const orgResult = await db
    .select({ orgId: orgMembers.orgId, orgName: organizations.name })
    .from(orgMembers)
    .innerJoin(organizations, eq(orgMembers.orgId, organizations.id))
    .where(eq(orgMembers.userId, adminUserId))
    .limit(1)

  if (orgResult.length === 0) {
    throw new ValidationError('No organization found')
  }

  const { orgId, orgName } = orgResult[0]

  // Get the domain
  const domainResult = await db.select().from(domains).limit(1)
  if (domainResult.length === 0) {
    throw new ValidationError('No domain configured')
  }
  const domain = domainResult[0]
  const fullEmail = `${emailLocal.toLowerCase()}@${domain.name}`

  // Check for existing user
  const existing = await db.select().from(users).where(eq(users.email, fullEmail)).limit(1)
  if (existing.length > 0) {
    throw new ValidationError('This email address is already taken')
  }

  // Generate temporary password
  const tempPassword = randomBytes(6).toString('base64url').slice(0, 10)
  const passwordHash = await hash(tempPassword)

  const userId = generateId('usr')
  const now = new Date()

  // Create user
  await db.insert(users).values({
    id: userId,
    email: fullEmail,
    name: `${firstName} ${lastName}`.trim(),
    passwordHash,
    setupComplete: true,
    setupStep: 'done',
    createdAt: now,
    updatedAt: now,
  })

  // Create mailbox
  const mailboxId = generateId('mbx')
  await db.insert(mailboxes).values({
    id: mailboxId,
    address: fullEmail,
    displayName,
    domainId: domain.id,
    userId,
    createdAt: now,
    updatedAt: now,
  })

  // Add to organization
  await db.insert(orgMembers).values({
    id: generateId('mem'),
    orgId,
    userId,
    role: 'member',
    createdAt: now,
  })

  // Send invitation email to external email (only if provided)
  const loginUrl = process.env.SITE_URL || 'https://mail.wistfare.com'
  if (externalEmail) {
  const { html, text } = buildInvitationEmail({
    displayName,
    newEmail: fullEmail,
    tempPassword,
    orgName,
    loginUrl: `${loginUrl}/login`,
  })

  const mailEngineUrl = process.env.MAIL_ENGINE_URL || 'http://mail-engine:8025'
  const inboundSecret = process.env.INBOUND_SECRET || ''

  try {
    await fetch(`${mailEngineUrl}/api/v1/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Inbound-Secret': inboundSecret,
      },
      body: JSON.stringify({
        from: `"${orgName}" <noreply@${domain.name}>`,
        to: [externalEmail],
        subject: `You've been invited to ${orgName} on Wistfare Mail`,
        html,
        text,
      }),
    })
    console.log(`Invitation email sent to ${externalEmail} for ${fullEmail}`)
  } catch (err) {
    console.error('Failed to send invitation email:', err)
  }
  }

  const audit = new AuditService(db)
  await audit.log({
    userId: adminUserId,
    action: 'user.created',
    resource: 'user',
    resourceId: userId,
    details: { email: fullEmail, invitedVia: externalEmail },
  })

  return c.json({
    user: { id: userId, name: displayName, email: fullEmail },
    mailbox: { id: mailboxId, address: fullEmail },
    invitationSentTo: externalEmail,
  }, 201)
})
