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
import { getServerIp } from '../lib/server-ip.js'
import { createDnsProvider } from '@wistmail/dns-manager'
import { generateDomainConnectUrl, verifyDomainConnectCallback } from '../lib/domain-connect.js'

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

setupRoutes.get('/status', async (c) => {
  const db = getDb()
  const result = await db.select({ count: sql<number>`count(*)` }).from(users)
  const userCount = Number(result[0]?.count || 0)

  const setupToken = await getSetupToken(c)

  return c.json({
    hasUsers: userCount > 0,
    inProgress: setupToken !== null,
    step: setupToken?.step || null,
    domainId: setupToken?.domainId || null,
  })
})

// ── Domain check (validate domain + detect server IP) ───────────────────────

const domainSchema = z.object({
  name: z
    .string()
    .min(3)
    .max(253)
    .regex(/^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/, 'Invalid domain name'),
})

setupRoutes.post('/domain/check', async (c) => {
  const body = await c.req.json()
  const parsed = domainSchema.safeParse(body)
  if (!parsed.success) {
    throw new ValidationError('Invalid domain name', { errors: parsed.error.flatten().fieldErrors })
  }

  const domainName = parsed.data.name.toLowerCase()
  const { promises: dns } = await import('node:dns')

  let resolvedIps: string[] = []
  let domainExists = false

  try {
    const ipv4 = await dns.resolve4(domainName).catch(() => [])
    const ipv6 = await dns.resolve6(domainName).catch(() => [])
    resolvedIps = [...ipv4, ...ipv6]
    domainExists = resolvedIps.length > 0
  } catch {
    domainExists = false
  }

  const serverIp = await getServerIp()

  return c.json({
    domainExists,
    resolvedIps,
    serverIp,
  })
})

// ── Step 1: Add Domain ──────────────────────────────────────────────────────

setupRoutes.post('/domain', async (c) => {
  const body = await c.req.json()
  const parsed = domainSchema.safeParse(body)
  if (!parsed.success) {
    throw new ValidationError('Invalid domain name', { errors: parsed.error.flatten().fieldErrors })
  }

  const db = getDb()
  const domainName = parsed.data.name.toLowerCase()

  const existing = await db.select().from(domains).where(eq(domains.name, domainName)).limit(1)
  if (existing.length > 0) {
    throw new ValidationError('This domain is already registered')
  }

  const domainService = new DomainService(db)
  const result = await domainService.createWithoutUser(domainName)

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

  setCookie(c, SETUP_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 86400,
  })

  return c.json(result, 201)
})

// ── Step 2: DNS Verification ────────────────────────────────────────────────

setupRoutes.post('/domain/verify', async (c) => {
  const setupToken = await getSetupToken(c)
  if (!setupToken || !setupToken.domainId) {
    throw new ValidationError('Invalid or expired setup session. Please start over.')
  }

  const db = getDb()
  const domainService = new DomainService(db)
  const result = await domainService.verifyById(setupToken.domainId)

  if (result.mx) {
    await db
      .update(setupTokens)
      .set({ step: 'account' })
      .where(eq(setupTokens.id, setupToken.id))
  }

  return c.json(result)
})

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

setupRoutes.post('/skip-dns', async (c) => {
  if (process.env.ALLOW_SKIP_DNS !== 'true') {
    throw new ValidationError('DNS verification is required. Please configure your DNS records to continue.')
  }

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

// ── Domain Connect (one-click Cloudflare DNS) ───────────────────────────────

/**
 * GET /api/v1/setup/domain-connect/url
 * Generates a signed Domain Connect apply URL for the user's domain.
 * User is redirected to Cloudflare to authorize DNS changes.
 */
setupRoutes.get('/domain-connect/url', async (c) => {
  const setupToken = await getSetupToken(c)
  if (!setupToken || !setupToken.domainId) {
    throw new ValidationError('Invalid or expired setup session. Please start over.')
  }

  const db = getDb()

  const domainResult = await db.select().from(domains).where(eq(domains.id, setupToken.domainId)).limit(1)
  if (domainResult.length === 0) {
    throw new ValidationError('Domain not found.')
  }

  const domain = domainResult[0]
  const serverIp = domain.serverIp || await getServerIp()

  const callbackUrl = `${c.req.header('origin') || 'https://mail.wistfare.com'}/setup/callback`

  try {
    const url = generateDomainConnectUrl({
      domain: domain.name,
      serverIp,
      dkimKey: domain.dkimPublicKey || '',
      redirectUri: callbackUrl,
    })

    return c.json({ url, domain: domain.name })
  } catch (err) {
    // Domain Connect signing not available — fall back to token flow
    return c.json({
      url: null,
      fallback: true,
      domain: domain.name,
      error: 'Domain Connect is not yet available. Please use the API token method.',
    })
  }
})

/**
 * GET /api/v1/setup/domain-connect/callback
 * Handles the redirect back from Cloudflare after Domain Connect authorization.
 */
setupRoutes.get('/domain-connect/callback', async (c) => {
  const queryParams = Object.fromEntries(new URL(c.req.url).searchParams.entries())
  const result = verifyDomainConnectCallback(queryParams)

  if (!result.success) {
    return c.json({ success: false, error: result.error })
  }

  // Domain Connect succeeded — Cloudflare already created the records
  // Advance setup token to account step
  const setupToken = await getSetupToken(c)
  if (setupToken) {
    const db = getDb()
    await db
      .update(setupTokens)
      .set({ step: 'account' })
      .where(eq(setupTokens.id, setupToken.id))

    // Update domain provider
    if (setupToken.domainId) {
      await db
        .update(domains)
        .set({ dnsProvider: 'cloudflare', updatedAt: new Date() })
        .where(eq(domains.id, setupToken.domainId))
    }
  }

  return c.json({ success: true })
})

// ── Cloudflare Token Integration (fallback) ─────────────────────────────────

const cloudflareSchema = z.object({
  apiToken: z.string().min(1, 'API token is required'),
})

setupRoutes.post('/cloudflare/connect', async (c) => {
  const setupToken = await getSetupToken(c)
  if (!setupToken || !setupToken.domainId) {
    throw new ValidationError('Invalid or expired setup session. Please start over.')
  }

  const body = await c.req.json()
  const parsed = cloudflareSchema.safeParse(body)
  if (!parsed.success) {
    throw new ValidationError('Invalid input', { errors: parsed.error.flatten().fieldErrors })
  }

  const db = getDb()
  // Get the domain name
  const domainResult = await db.select().from(domains).where(eq(domains.id, setupToken.domainId)).limit(1)
  if (domainResult.length === 0) {
    throw new ValidationError('Domain not found. Please start over.')
  }

  const provider = createDnsProvider({
    provider: 'cloudflare',
    cloudflare: { apiToken: parsed.data.apiToken },
  })

  const result = await provider.verifyConnection(domainResult[0].name)

  if (result.valid && result.zoneId) {
    const domainService = new DomainService(db)
    await domainService.updateCloudflare(setupToken.domainId, result.zoneId)
  }

  return c.json(result)
})

setupRoutes.post('/cloudflare/create-records', async (c) => {
  const setupToken = await getSetupToken(c)
  if (!setupToken || !setupToken.domainId) {
    throw new ValidationError('Invalid or expired setup session. Please start over.')
  }

  const body = await c.req.json()
  const parsed = cloudflareSchema.safeParse(body)
  if (!parsed.success) {
    throw new ValidationError('Invalid input', { errors: parsed.error.flatten().fieldErrors })
  }

  const db = getDb()
  const domainResult = await db.select().from(domains).where(eq(domains.id, setupToken.domainId)).limit(1)
  if (domainResult.length === 0) {
    throw new ValidationError('Domain not found. Please start over.')
  }

  const domain = domainResult[0]
  if (!domain.cloudflareZoneId) {
    throw new ValidationError('Cloudflare not connected for this domain. Please connect first.')
  }

  const domainService = new DomainService(db)
  const dnsRecords = domainService.getDnsRecords(domain.name, domain.dkimPublicKey || '', domain.serverIp || undefined)

  const provider = createDnsProvider({
    provider: 'cloudflare',
    cloudflare: { apiToken: parsed.data.apiToken, zoneId: domain.cloudflareZoneId },
  })

  // Convert to DnsRecordInput format
  const recordInputs = dnsRecords.map((r) => ({
    type: r.type as 'MX' | 'TXT',
    name: r.name,
    content: r.value,
    priority: r.priority,
  }))

  const results = await provider.createRecords(domain.cloudflareZoneId, recordInputs)
  const allCreated = results.every((r) => r.success)

  return c.json({
    results: results.map((r) => ({
      type: r.type,
      name: r.name,
      success: r.success,
      error: r.error,
    })),
    allCreated,
  })
})

// ── Step 3: Create Admin Account ────────────────────────────────────────────

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

  const domainResult = await db.select().from(domains).where(eq(domains.id, setupToken.domainId)).limit(1)
  if (domainResult.length === 0) {
    throw new ValidationError('Domain not found. Please start over.')
  }
  const domain = domainResult[0]

  const fullEmail = `${parsed.data.emailLocal.toLowerCase()}@${domain.name}`

  const existingUser = await db.select().from(users).where(eq(users.email, fullEmail)).limit(1)
  if (existingUser.length > 0) {
    throw new ValidationError('This email address is already taken')
  }

  const passwordHash = await hash(parsed.data.password)

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

  await db.update(domains).set({ userId }).where(eq(domains.id, domain.id))

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

  await db.insert(orgMembers).values({
    id: generateId('mem'),
    orgId,
    userId,
    role: 'owner',
    createdAt: now,
  })

  const sessionId = generateId('ses')
  const sessionToken = randomBytes(32).toString('hex')
  const sessionExpiry = new Date(Date.now() + SESSION_DURATION_MS)

  await db.insert(sessions).values({
    id: sessionId,
    userId,
    token: sessionToken,
    expiresAt: sessionExpiry,
  })

  setCookie(c, SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60,
  })

  await db.delete(setupTokens).where(eq(setupTokens.id, setupToken.id))
  deleteCookie(c, SETUP_COOKIE)

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

setupRoutes.get('/domains', async (c) => {
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
