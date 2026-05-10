import { Hono } from 'hono'
import type { Context } from 'hono'
import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { RateLimitError, ValidationError } from '@wistmail/shared'
import { mfaMethods, users } from '@wistmail/db'
import { sessionAuth, type SessionEnv } from '../middleware/session-auth.js'
import { getDb } from '../lib/db.js'
import { MfaService } from '../services/mfa.js'
import { resolveOrgFrom } from '../lib/org-from.js'
import {
  checkMfaRateLimit,
  refundMfaRateLimit,
  type MfaRateLimitScope,
} from '../lib/mfa-rate-limit.js'

export const mfaRoutes = new Hono<SessionEnv>()

mfaRoutes.use('*', sessionAuth)

/// Apply the MFA confirm rate limit — 5 attempts / 60s per (user, scope).
/// Throws `RateLimitError` (HTTP 429) on the 6th attempt. Successful
/// confirms refund the slot via `refundMfaRateLimit` so the legitimate
/// user is never penalized.
async function enforceMfaRateLimit(
  userId: string,
  scope: MfaRateLimitScope,
): Promise<void> {
  const r = await checkMfaRateLimit(userId, scope)
  if (!r.allowed) {
    throw new RateLimitError(Math.max(1, Math.ceil(r.retryAfterMs / 1000)))
  }
}

/// GET /api/v1/mfa/methods
/// List the methods this user has set up. Includes verified flag and
/// backup-code remaining count so the settings UI can render in one call.
mfaRoutes.get('/methods', async (c) => {
  const db = getDb()
  const svc = new MfaService(db)
  const userId = c.get('userId')

  const methods = await svc.listMethods(userId)
  const backup = await svc.backupCodeStatus(userId)
  return c.json({ methods, backupCodes: backup })
})

/// DELETE /api/v1/mfa/methods/:id
mfaRoutes.delete('/methods/:id', async (c) => {
  const db = getDb()
  const svc = new MfaService(db)
  const userId = c.get('userId')
  await svc.deleteMethod(userId, c.req.param('id'))
  return c.json({ ok: true })
})

/// POST /api/v1/mfa/totp/setup
/// Issue a fresh (or reuse the unverified) TOTP secret + otpauth URL.
/// Caller renders the URL as a QR code OR shows the base32 secret for
/// manual entry. Verification happens via /totp/verify.
mfaRoutes.post('/totp/setup', async (c) => {
  const db = getDb()
  const svc = new MfaService(db)
  const userId = c.get('userId')

  const userRow = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  if (userRow.length === 0) throw new ValidationError('User not found')

  const result = await svc.beginTotpSetup(userId, userRow[0].email)
  return c.json(result)
})

/// POST /api/v1/mfa/totp/verify { methodId, code }
/// (Alias: POST /api/v1/mfa/totp/confirm — same handler, the confirm
/// path is the V3-design name; verify stays for backwards compat.)
/// Confirms TOTP setup. On the first successful verification we also
/// generate fresh backup codes and return them — they can ONLY be shown
/// at this moment.
async function handleTotpConfirm(c: Context<SessionEnv>) {
  const db = getDb()
  const svc = new MfaService(db)
  const userId = c.get('userId')

  await enforceMfaRateLimit(userId, 'totp-confirm')

  const body = await c.req.json().catch(() => ({}))
  const parsed = z
    .object({
      methodId: z.string().min(1),
      code: z.string().min(6).max(8),
    })
    .safeParse(body)
  if (!parsed.success) {
    throw new ValidationError('Invalid input', {
      errors: parsed.error.flatten().fieldErrors,
    })
  }

  const ok = await svc.verifyTotpSetup(userId, parsed.data.methodId, parsed.data.code)
  if (!ok) {
    throw new ValidationError("That code didn't match. Try the next one your app shows.")
  }

  // Successful confirm — refund the slot so the legitimate user isn't
  // penalised for the attempt they just used correctly.
  await refundMfaRateLimit(userId, 'totp-confirm')

  // First-time setup → fresh backup codes; subsequent verifies don't reissue.
  const status = await svc.backupCodeStatus(userId)
  let backupCodes: string[] | null = null
  if (status.total === 0) {
    backupCodes = await svc.regenerateBackupCodes(userId)
  }
  return c.json({ ok: true, backupCodes })
}

mfaRoutes.post('/totp/verify', handleTotpConfirm)
mfaRoutes.post('/totp/confirm', handleTotpConfirm)

/// POST /api/v1/mfa/email/setup { address }
/// Stores the (lowercased) address as an unverified email-MFA method and
/// dispatches a 6-digit code to it. Verify with /email/verify.
mfaRoutes.post('/email/setup', async (c) => {
  const db = getDb()
  const svc = new MfaService(db)
  const userId = c.get('userId')
  const body = await c.req.json().catch(() => ({}))
  const parsed = z
    .object({ address: z.string().email('Invalid email address') })
    .safeParse(body)
  if (!parsed.success) {
    throw new ValidationError('Invalid email address', {
      errors: parsed.error.flatten().fieldErrors,
    })
  }

  const userRow = await db
    .select({ name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  if (userRow.length === 0) throw new ValidationError('User not found')

  const fallbackDomain = userRow[0].email.split('@')[1] ?? 'wistfare.com'
  const { orgName, fromDomain } = await resolveOrgFrom(db, userId, fallbackDomain)

  const methodId = await svc.beginEmailSetup(
    userId,
    parsed.data.address,
    orgName,
    fromDomain,
    userRow[0].name,
  )
  return c.json({ methodId })
})

/// POST /api/v1/mfa/email/verify { methodId, code }
/// (Alias: POST /api/v1/mfa/email/confirm — same handler.)
async function handleEmailConfirm(c: Context<SessionEnv>) {
  const db = getDb()
  const svc = new MfaService(db)
  const userId = c.get('userId')

  await enforceMfaRateLimit(userId, 'email-confirm')

  const body = await c.req.json().catch(() => ({}))
  const parsed = z
    .object({
      methodId: z.string().min(1),
      code: z.string().min(6).max(8),
    })
    .safeParse(body)
  if (!parsed.success) throw new ValidationError('Invalid input')

  const ok = await svc.verifyEmailSetup(userId, parsed.data.methodId, parsed.data.code)
  if (!ok) {
    throw new ValidationError('That code is incorrect or expired.')
  }

  await refundMfaRateLimit(userId, 'email-confirm')

  const status = await svc.backupCodeStatus(userId)
  let backupCodes: string[] | null = null
  if (status.total === 0) {
    backupCodes = await svc.regenerateBackupCodes(userId)
  }
  return c.json({ ok: true, backupCodes })
}

mfaRoutes.post('/email/verify', handleEmailConfirm)
mfaRoutes.post('/email/confirm', handleEmailConfirm)

/// GET /api/v1/mfa/backup-codes
/// Returns the remaining/total counter only — raw codes are never
/// re-exposed after the one-time setup response. To get fresh codes
/// the user must regenerate.
mfaRoutes.get('/backup-codes', async (c) => {
  const db = getDb()
  const svc = new MfaService(db)
  const userId = c.get('userId')
  const status = await svc.backupCodeStatus(userId)
  return c.json(status)
})

/// POST /api/v1/mfa/backup-codes/regenerate
/// Invalidates existing codes and returns 10 new ones (shown ONCE).
mfaRoutes.post('/backup-codes/regenerate', async (c) => {
  const db = getDb()
  const svc = new MfaService(db)
  const userId = c.get('userId')
  const codes = await svc.regenerateBackupCodes(userId)
  return c.json({ codes })
})

/// DELETE /api/v1/mfa/methods/by-type/:type
/// Convenience for the V3 settings UI — disables every method of the
/// given type for the current user. The :id variant above is used when
/// the caller has a specific row id; this one is keyed by factor type
/// so the UI can offer "remove TOTP" without a round-trip first.
mfaRoutes.delete('/methods/by-type/:type', async (c) => {
  const db = getDb()
  const svc = new MfaService(db)
  const userId = c.get('userId')
  const typeParam = c.req.param('type')
  if (typeParam !== 'totp' && typeParam !== 'email') {
    throw new ValidationError('Unknown MFA method type')
  }
  const rows = await db
    .select({ id: mfaMethods.id })
    .from(mfaMethods)
    .where(and(eq(mfaMethods.userId, userId), eq(mfaMethods.type, typeParam)))
  for (const row of rows) {
    await svc.deleteMethod(userId, row.id)
  }
  return c.json({ ok: true, removed: rows.length })
})

/// Sigil for the MFA challenge methods chip on the login screen — used
/// by /auth/login to tell the client what to show after step 1.
export type MfaMethodSummary = {
  type: 'totp' | 'email'
  label: string | null
}
