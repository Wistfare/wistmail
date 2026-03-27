import { Hono } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { z } from 'zod'
import { eq, sql } from 'drizzle-orm'
import { hash } from 'argon2'
import { randomBytes } from 'node:crypto'
import { ValidationError, generateId } from '@wistmail/shared'
import { users, domains, mailboxes, setupTokens, organizations, orgMembers, sessions } from '@wistmail/db'
import { DomainService } from '../services/domain.js'
import { AuditService } from '../services/audit.js'
import { getDb } from '../lib/db.js'

const SETUP_COOKIE = 'wm_setup_token'
const SETUP_TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000 // 24 hours
const SESSION_COOKIE = 'wm_session'
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

export const setupRoutes = new Hono()

// ── Helper: validate setup token from cookie ────────────────────────────────

async function getSetupToken(c: any) {
  const token = getCookie(c, SETUP_COOKIE)
  if (!token) return null

  const db = getDb()
  const result = await db
    .select()
    .from(setupTokens)
    .where(eq(setupTokens.token, token))
    .limit(1)

  if (result.length === 0) return null
  if (new Date() > result[0].expiresAt) {
    await db.delete(setupTokens).where(eq(setupTokens.id, result[0].id))
    return null
  }

  return result[0]
}

// ── Check if system has any users (fresh install detection) ─────────────────

/**
 * GET /api/v1/setup/status
 * Returns whether the system has been set up (any users exist).
 */
setupRoutes.get('/status', async (c) => {
  const db = getDb()
  const result = await db.select({ count: sql<number>`count(*)` }).from(users)
  const userCount = Number(result[0]?.count || 0)

  // Also check if there's an active setup token
  const setupToken = await getSetupToken(c)

  return c.json({
    hasUsers: userCount > 0,
    inProgress: setupToken !== null,
    step: setupToken?.step || null,
    domainId: setupToken?.domainId || null,
  })
})

// ── Step 1: Add Domain (NO AUTH — first thing user does) ────────────────────

const domainSchema = z.object({
  name: z
    .string()
    .min(3)
    .max(253)
    .regex(/^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/, 'Invalid domain name'),
})

/**
 * POST /api/v1/setup/domain
 * No auth required. Creates domain + setup token.
 */
setupRoutes.post('/domain', async (c) => {
  const body = await c.req.json()
  const parsed = domainSchema.safeParse(body)
  if (!parsed.success) {
    throw new ValidationError('Invalid domain name', { errors: parsed.error.flatten().fieldErrors })
  }

  const db = getDb()
  const domainName = parsed.data.name.toLowerCase()

  // Check if domain already registered
  const existing = await db.select().from(domains).where(eq(domains.name, domainName)).limit(1)
  if (existing.length > 0) {
    throw new ValidationError('This domain is already registered')
  }

  // Create domain without userId (no user yet)
  const domainService = new DomainService(db)
  const result = await domainService.createWithoutUser(domainName)

  // Create setup token
  const tokenId = generateId('stk')
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + SETUP_TOKEN_EXPIRY_MS)

  await db.insert(setupTokens).values({
    id: tokenId,
    token,
    domainId: result.id,
    step: 'dns',
    expiresAt,
  })

  // Set setup token cookie
  setCookie(c, SETUP_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 86400, // 24 hours
  })

  return c.json(result, 201)
})

// ── Step 2: Verify DNS (uses setup token) ───────────────────────────────────

/**
 * POST /api/v1/setup/domain/verify
 * No auth — uses setup token cookie.
 */
setupRoutes.post('/domain/verify', async (c) => {
  const setupToken = await getSetupToken(c)
  if (!setupToken || !setupToken.domainId) {
    throw new ValidationError('Invalid or expired setup session. Please start over.')
  }

  const db = getDb()
  const domainService = new DomainService(db)
  const result = await domainService.verifyById(setupToken.domainId)

  // Update setup token step if MX verified
  if (result.mx) {
    await db
      .update(setupTokens)
      .set({ step: 'account' })
      .where(eq(setupTokens.id, setupToken.id))
  }

  return c.json(result)
})

/**
 * GET /api/v1/setup/domain/records
 * Get DNS records for the domain in current setup session.
 */
setupRoutes.get('/domain/records', async (c) => {
  const setupToken = await getSetupToken(c)
  if (!setupToken || !setupToken.domainId) {
    throw new ValidationError('Invalid or expired setup session.')
  }

  const db = getDb()
  const domainService = new DomainService(db)
  const result = await domainService.getRecordsById(setupToken.domainId)

  return c.json(result)
})

/**
 * POST /api/v1/setup/skip-dns
 * Skip remaining DNS verification (MX must be verified or user explicitly skips all).
 */
setupRoutes.post('/skip-dns', async (c) => {
  const setupToken = await getSetupToken(c)
  if (!setupToken) {
    throw new ValidationError('Invalid or expired setup session.')
  }

  const db = getDb()
  await db
    .update(setupTokens)
    .set({ step: 'account' })
    .where(eq(setupTokens.id, setupToken.id))

  return c.json({ step: 'account' })
})

// ── Step 3: Create Admin Account (uses setup token) ─────────────────────────

const accountSchema = z.object({
  displayName: z.string().min(2, 'Name must be at least 2 characters').max(255),
  emailLocal: z.string().min(1, 'Email address is required').max(64).regex(/^[a-zA-Z0-9._%+-]+$/, 'Invalid email characters'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Must include an uppercase letter')
    .regex(/[a-z]/, 'Must include a lowercase letter')
    .regex(/\d/, 'Must include a number'),
})

/**
 * POST /api/v1/setup/account
 * No auth — uses setup token. Creates user + mailbox + org + session.
 */
setupRoutes.post('/account', async (c) => {
  const setupToken = await getSetupToken(c)
  if (!setupToken || !setupToken.domainId) {
    throw new ValidationError('Invalid or expired setup session. Please start over.')
  }

  const body = await c.req.json()
  const parsed = accountSchema.safeParse(body)
  if (!parsed.success) {
    throw new ValidationError('Invalid input', { errors: parsed.error.flatten().fieldErrors })
  }

  const db = getDb()

  // Get the domain
  const domainResult = await db.select().from(domains).where(eq(domains.id, setupToken.domainId)).limit(1)
  if (domainResult.length === 0) {
    throw new ValidationError('Domain not found. Please start over.')
  }
  const domain = domainResult[0]

  // Construct full email
  const fullEmail = `${parsed.data.emailLocal.toLowerCase()}@${domain.name}`

  // Check email uniqueness
  const existingUser = await db.select().from(users).where(eq(users.email, fullEmail)).limit(1)
  if (existingUser.length > 0) {
    throw new ValidationError('This email address is already taken')
  }

  // Hash password
  const passwordHash = await hash(parsed.data.password)

  // Create user
  const userId = generateId('usr')
  const now = new Date()
  await db.insert(users).values({
    id: userId,
    email: fullEmail,
    name: parsed.data.displayName.trim(),
    passwordHash,
    setupComplete: true,
    setupStep: 'done',
    createdAt: now,
    updatedAt: now,
  })

  // Assign domain to user
  await db.update(domains).set({ userId }).where(eq(domains.id, domain.id))

  // Create mailbox
  const mailboxId = generateId('mbx')
  await db.insert(mailboxes).values({
    id: mailboxId,
    address: fullEmail,
    displayName: parsed.data.displayName.trim(),
    domainId: domain.id,
    userId,
    createdAt: now,
    updatedAt: now,
  })

  // Create organization
  const orgId = generateId('org')
  const orgSlug = domain.name.replace(/\./g, '-')
  await db.insert(organizations).values({
    id: orgId,
    name: domain.name,
    slug: orgSlug,
    ownerId: userId,
    createdAt: now,
    updatedAt: now,
  })

  // Add user as owner of organization
  await db.insert(orgMembers).values({
    id: generateId('mem'),
    orgId,
    userId,
    role: 'owner',
    createdAt: now,
  })

  // Create session
  const sessionId = generateId('ses')
  const sessionToken = randomBytes(32).toString('hex')
  const sessionExpiry = new Date(Date.now() + SESSION_DURATION_MS)

  await db.insert(sessions).values({
    id: sessionId,
    userId,
    token: sessionToken,
    expiresAt: sessionExpiry,
  })

  // Set session cookie
  setCookie(c, SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60,
  })

  // Delete setup token
  await db.delete(setupTokens).where(eq(setupTokens.id, setupToken.id))
  deleteCookie(c, SETUP_COOKIE)

  // Audit log
  const audit = new AuditService(db)
  await audit.log({
    userId,
    action: 'user.register',
    resource: 'user',
    resourceId: userId,
    details: { email: fullEmail, domain: domain.name },
  })

  return c.json({
    user: {
      id: userId,
      name: parsed.data.displayName.trim(),
      email: fullEmail,
    },
    mailbox: {
      id: mailboxId,
      address: fullEmail,
    },
    organization: {
      id: orgId,
      name: domain.name,
    },
  }, 201)
})

// ── Authenticated setup routes (for existing users managing domains) ────────

/**
 * GET /api/v1/setup/domains
 * List domains (requires session auth — for settings page).
 */
setupRoutes.get('/domains', async (c) => {
  // Try session auth
  const sessionCookie = getCookie(c, SESSION_COOKIE)
  if (!sessionCookie) {
    return c.json({ data: [] })
  }

  const db = getDb()
  const sessionResult = await db.select().from(sessions).where(eq(sessions.token, sessionCookie)).limit(1)
  if (sessionResult.length === 0) {
    return c.json({ data: [] })
  }

  const userId = sessionResult[0].userId
  const domainService = new DomainService(db)
  const result = await domainService.list(userId)
  return c.json({ data: result })
})

/**
 * GET /api/v1/setup/mailboxes
 * List mailboxes (requires session auth).
 */
setupRoutes.get('/mailboxes', async (c) => {
  const sessionCookie = getCookie(c, SESSION_COOKIE)
  if (!sessionCookie) {
    return c.json({ data: [] })
  }

  const db = getDb()
  const sessionResult = await db.select().from(sessions).where(eq(sessions.token, sessionCookie)).limit(1)
  if (sessionResult.length === 0) {
    return c.json({ data: [] })
  }

  const userId = sessionResult[0].userId
  const result = await db.select().from(mailboxes).where(eq(mailboxes.userId, userId))
  return c.json({ data: result })
})
