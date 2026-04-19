import { Hono } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { z } from 'zod'
import { hash } from 'argon2'
import { createHash, randomBytes } from 'node:crypto'
import { eq, and, isNull, gt } from 'drizzle-orm'
import { ValidationError, generateId } from '@wistmail/shared'
import { users, passwordResetTokens, sessions, mfaMethods, organizations, orgMembers, domains } from '@wistmail/db'
import { AuthService } from '../services/auth.js'
import { MfaService } from '../services/mfa.js'
import { getDb } from '../lib/db.js'
import { buildPasswordResetEmail } from '../templates/password-reset.js'
import { resolveOrgFrom } from '../lib/org-from.js'

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
})

const COOKIE_NAME = 'wm_session'
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60 // 30 days in seconds

const RESET_TOKEN_TTL_MS = 30 * 60 * 1000 // 30 minutes
const MAIL_ENGINE_URL = process.env.MAIL_ENGINE_URL || 'http://mail-engine:8025'
const INBOUND_SECRET = process.env.INBOUND_SECRET || ''
const SITE_URL = process.env.SITE_URL || 'https://mail.wistfare.com'

// Per-IP rate limit for /forgot-password (10 requests / 10 min)
const forgotRateLimit = new Map<string, { count: number; resetAt: number }>()
function checkForgotRateLimit(key: string): boolean {
  if (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true') return true
  const now = Date.now()
  const entry = forgotRateLimit.get(key)
  if (!entry || now > entry.resetAt) {
    forgotRateLimit.set(key, { count: 1, resetAt: now + 10 * 60 * 1000 })
    return true
  }
  if (entry.count >= 10) return false
  entry.count++
  return true
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export const authRoutes = new Hono()

/**
 * POST /api/v1/auth/login
 *
 * Step 1 of the 2-step login. Validates credentials. If the user has any
 * verified MFA method, the response is { mfaRequired: true, pendingToken,
 * methods } and NO session cookie is set — the client must call
 * /login/verify with a code to complete sign-in. If no MFA is configured,
 * the session cookie is set immediately (current behavior).
 */
authRoutes.post('/login', async (c) => {
  const body = await c.req.json()
  const parsed = loginSchema.safeParse(body)
  if (!parsed.success) {
    throw new ValidationError('Invalid input', {
      errors: parsed.error.flatten().fieldErrors,
    })
  }

  const db = getDb()
  const auth = new AuthService(db)
  const userRecord = await auth.verifyCredentials(parsed.data)

  const mfa = new MfaService(db)
  if (await mfa.hasVerifiedMethod(userRecord.id)) {
    const methods = await db
      .select({ type: mfaMethods.type, label: mfaMethods.label })
      .from(mfaMethods)
      .where(
        and(
          eq(mfaMethods.userId, userRecord.id),
          eq(mfaMethods.verified, 'true'),
        ),
      )
    const { pendingToken } = await mfa.createPendingLogin(userRecord.id)
    return c.json({
      mfaRequired: true,
      pendingToken,
      methods,
    })
  }

  const { user, session } = await auth.beginSession(userRecord.id)
  setCookie(c, COOKIE_NAME, session.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  })
  return c.json({ user })
})

/**
 * POST /api/v1/auth/login/verify
 * Body: { pendingToken, code }
 *
 * Step 2 of the 2-step login. Tries the supplied code against every
 * verified MFA factor. On success, sets the session cookie and returns
 * the user record.
 */
authRoutes.post('/login/verify', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const parsed = z
    .object({
      pendingToken: z.string().min(16),
      code: z.string().min(4).max(20),
    })
    .safeParse(body)
  if (!parsed.success) {
    throw new ValidationError('Invalid input', {
      errors: parsed.error.flatten().fieldErrors,
    })
  }

  const db = getDb()
  const mfa = new MfaService(db)

  const userId = await mfa.claimPendingLogin(parsed.data.pendingToken)
  if (!userId) {
    throw new ValidationError('This login session has expired. Please sign in again.')
  }

  const matched = await mfa.tryAnyFactor(userId, parsed.data.code)
  if (!matched) {
    throw new ValidationError('That code is incorrect.')
  }

  await mfa.deletePendingLogin(parsed.data.pendingToken)

  const auth = new AuthService(db)
  const { user, session } = await auth.beginSession(userId)
  setCookie(c, COOKIE_NAME, session.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  })
  return c.json({ user, methodUsed: matched })
})

/**
 * POST /api/v1/auth/login/email-code
 * Body: { pendingToken }
 *
 * Dispatches a fresh email-MFA code to the user's verified backup address.
 * The pending token must still be valid; this does NOT issue a new one.
 */
authRoutes.post('/login/email-code', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const parsed = z.object({ pendingToken: z.string().min(16) }).safeParse(body)
  if (!parsed.success) throw new ValidationError('Invalid input')

  const db = getDb()
  const mfa = new MfaService(db)
  const userId = await mfa.claimPendingLogin(parsed.data.pendingToken)
  if (!userId) {
    throw new ValidationError('This login session has expired. Please sign in again.')
  }

  const userRow = await db
    .select({ name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  if (userRow.length === 0) throw new ValidationError('User not found')
  const fallback = userRow[0].email.split('@')[1] ?? 'wistfare.com'
  const { orgName, fromDomain } = await resolveOrgFrom(db, userId, fallback)

  const ok = await mfa.dispatchLoginEmailCode(userId, orgName, fromDomain, userRow[0].name)
  if (!ok) {
    throw new ValidationError('No verified email factor on this account.')
  }
  return c.json({ ok: true })
})

/**
 * GET /api/v1/auth/session
 * Validate session and return current user.
 */
authRoutes.get('/session', async (c) => {
  const token = getCookie(c, COOKIE_NAME)
  if (!token) {
    return c.json({ user: null }, 200)
  }

  const db = getDb()
  const auth = new AuthService(db)
  const result = await auth.validateSession(token)

  if (!result) {
    deleteCookie(c, COOKIE_NAME)
    return c.json({ user: null }, 200)
  }

  return c.json({ user: result.user })
})

/**
 * POST /api/v1/auth/forgot-password
 * Body: { email }
 *
 * Always returns 200 to avoid leaking which addresses exist. If the address
 * matches a user, generates a single-use reset token (raw value sent by email,
 * SHA-256 hash stored in DB) and emails the link to the user's externalEmail
 * if set, otherwise to their mailbox address.
 */
authRoutes.post('/forgot-password', async (c) => {
  const ip = c.req.header('cf-connecting-ip') || c.req.header('x-real-ip') || 'unknown'
  if (!checkForgotRateLimit(ip)) {
    return c.json({ error: { code: 'RATE_LIMIT', message: 'Too many requests. Try again later.' } }, 429)
  }

  const body = await c.req.json().catch(() => ({}))
  const parsed = z.object({ email: z.string().email() }).safeParse(body)
  if (!parsed.success) {
    // Still respond OK — don't leak which inputs are valid email format.
    return c.json({ ok: true })
  }

  const db = getDb()
  const email = parsed.data.email.trim().toLowerCase()

  const userResult = await db
    .select({
      id: users.id,
      name: users.name,
      mailboxEmail: users.email,
      externalEmail: users.externalEmail,
    })
    .from(users)
    .where(eq(users.email, email))
    .limit(1)

  if (userResult.length === 0) {
    // Don't leak — pretend we sent it.
    return c.json({ ok: true })
  }
  const user = userResult[0]

  // Generate token: send raw to email, store SHA-256 hash in DB.
  const rawToken = randomBytes(32).toString('hex')
  const tokenHash = hashToken(rawToken)
  const tokenId = generateId('prt')
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS)

  await db.insert(passwordResetTokens).values({
    id: tokenId,
    userId: user.id,
    tokenHash,
    expiresAt,
  })

  // Recipient: prefer external recovery address, fall back to mailbox address.
  const recipient = user.externalEmail || user.mailboxEmail
  const fromDomain = user.mailboxEmail.split('@')[1]

  // Look up org name + verify the domain exists / is verified before sending.
  const orgResult = await db
    .select({ orgName: organizations.name })
    .from(organizations)
    .innerJoin(orgMembers, eq(orgMembers.orgId, organizations.id))
    .where(eq(orgMembers.userId, user.id))
    .limit(1)
  const orgName = orgResult[0]?.orgName || fromDomain

  const domainResult = await db
    .select({ name: domains.name, verified: domains.verified })
    .from(domains)
    .where(eq(domains.name, fromDomain))
    .limit(1)
  const domainOk = domainResult.length > 0 && domainResult[0].verified

  const resetUrl = `${SITE_URL}/reset-password?token=${encodeURIComponent(rawToken)}`
  const { html, text } = buildPasswordResetEmail({
    displayName: user.name,
    email: user.mailboxEmail,
    resetUrl,
    orgName,
    expiresInMinutes: Math.round(RESET_TOKEN_TTL_MS / 60000),
  })

  if (domainOk) {
    fetch(`${MAIL_ENGINE_URL}/api/v1/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Inbound-Secret': INBOUND_SECRET,
      },
      body: JSON.stringify({
        from: `"${orgName}" <noreply@${fromDomain}>`,
        to: [recipient],
        subject: `Reset your ${orgName} password`,
        html,
        text,
      }),
    }).catch((err) => {
      console.error('[auth] forgot-password send failed:', err)
    })
  } else {
    console.warn(`[auth] forgot-password: domain ${fromDomain} not verified, skipping send`)
  }

  return c.json({ ok: true })
})

/**
 * POST /api/v1/auth/reset-password
 * Body: { token, newPassword }
 *
 * Validates the token (single-use, must be unused and unexpired), updates
 * the user's password, marks the token used, and revokes all of that user's
 * existing sessions.
 */
authRoutes.post('/reset-password', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const parsed = z
    .object({
      token: z.string().min(32),
      newPassword: z
        .string()
        .min(8, 'Password must be at least 8 characters')
        .regex(/[A-Z]/, 'Must include an uppercase letter')
        .regex(/[a-z]/, 'Must include a lowercase letter')
        .regex(/\d/, 'Must include a number'),
      mfaCode: z.string().min(4).max(20).optional(),
    })
    .safeParse(body)

  if (!parsed.success) {
    throw new ValidationError('Invalid input', { errors: parsed.error.flatten().fieldErrors })
  }

  const db = getDb()
  const tokenHash = hashToken(parsed.data.token)
  const now = new Date()

  const tokenResult = await db
    .select()
    .from(passwordResetTokens)
    .where(
      and(
        eq(passwordResetTokens.tokenHash, tokenHash),
        isNull(passwordResetTokens.usedAt),
        gt(passwordResetTokens.expiresAt, now),
      ),
    )
    .limit(1)

  if (tokenResult.length === 0) {
    throw new ValidationError('This reset link has expired or already been used. Please request a new one.')
  }
  const token = tokenResult[0]

  // If the user has MFA configured, require a code in addition to the email
  // link — the email factor alone shouldn't be enough to take over the
  // account.
  const mfa = new MfaService(db)
  if (await mfa.hasVerifiedMethod(token.userId)) {
    if (!parsed.data.mfaCode) {
      // 412 = Precondition Required — client knows to prompt for the code.
      return c.json(
        {
          mfaRequired: true,
          error: {
            code: 'MFA_REQUIRED',
            message: 'Enter your two-factor code to continue.',
          },
        },
        412,
      )
    }
    const matched = await mfa.tryAnyFactor(token.userId, parsed.data.mfaCode)
    if (!matched) {
      throw new ValidationError('That two-factor code is incorrect.')
    }
  }

  const newHash = await hash(parsed.data.newPassword)

  await db.update(users).set({ passwordHash: newHash, updatedAt: now }).where(eq(users.id, token.userId))
  await db
    .update(passwordResetTokens)
    .set({ usedAt: now })
    .where(eq(passwordResetTokens.id, token.id))

  // Revoke all existing sessions for this user — they must log in fresh.
  await db.delete(sessions).where(eq(sessions.userId, token.userId))

  return c.json({ ok: true })
})

/**
 * POST /api/v1/auth/reset-password/email-code
 * Body: { token }
 *
 * Issues a fresh email-MFA code for the reset flow, addressed to the
 * user's verified email-MFA address. Used when the reset page needs the
 * user to enter a code via email.
 */
authRoutes.post('/reset-password/email-code', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const parsed = z.object({ token: z.string().min(32) }).safeParse(body)
  if (!parsed.success) throw new ValidationError('Invalid input')

  const db = getDb()
  const tokenHash = hashToken(parsed.data.token)
  const now = new Date()
  const tokenResult = await db
    .select()
    .from(passwordResetTokens)
    .where(
      and(
        eq(passwordResetTokens.tokenHash, tokenHash),
        isNull(passwordResetTokens.usedAt),
        gt(passwordResetTokens.expiresAt, now),
      ),
    )
    .limit(1)
  if (tokenResult.length === 0) {
    throw new ValidationError('This reset link has expired or already been used.')
  }

  const userRow = await db
    .select({ name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, tokenResult[0].userId))
    .limit(1)
  if (userRow.length === 0) throw new ValidationError('User not found')
  const fallback = userRow[0].email.split('@')[1] ?? 'wistfare.com'
  const { orgName, fromDomain } = await resolveOrgFrom(db, tokenResult[0].userId, fallback)

  const mfa = new MfaService(db)
  const ok = await mfa.dispatchLoginEmailCode(
    tokenResult[0].userId,
    orgName,
    fromDomain,
    userRow[0].name,
  )
  if (!ok) throw new ValidationError('No verified email factor on this account.')
  return c.json({ ok: true })
})

/**
 * POST /api/v1/auth/logout
 */
authRoutes.post('/logout', async (c) => {
  const token = getCookie(c, COOKIE_NAME)
  if (token) {
    const db = getDb()
    const auth = new AuthService(db)
    await auth.logout(token)
  }

  deleteCookie(c, COOKIE_NAME)
  return c.json({ ok: true })
})
