import { Hono } from 'hono'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { ValidationError } from '@wistmail/shared'
import { users } from '@wistmail/db'
import { sessionAuth, type SessionEnv } from '../middleware/session-auth.js'
import { getDb } from '../lib/db.js'
import { MfaService } from '../services/mfa.js'
import { resolveOrgFrom } from '../lib/org-from.js'

export const mfaRoutes = new Hono<SessionEnv>()

mfaRoutes.use('*', sessionAuth)

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
/// Confirms TOTP setup. On the first successful verification we also
/// generate fresh backup codes and return them — they can ONLY be shown
/// at this moment.
mfaRoutes.post('/totp/verify', async (c) => {
  const db = getDb()
  const svc = new MfaService(db)
  const userId = c.get('userId')
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
    throw new ValidationError('That code didn\'t match. Try the next one your app shows.')
  }

  // First-time setup → fresh backup codes; subsequent verifies don't reissue.
  const status = await svc.backupCodeStatus(userId)
  let backupCodes: string[] | null = null
  if (status.total === 0) {
    backupCodes = await svc.regenerateBackupCodes(userId)
  }
  return c.json({ ok: true, backupCodes })
})

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
mfaRoutes.post('/email/verify', async (c) => {
  const db = getDb()
  const svc = new MfaService(db)
  const userId = c.get('userId')
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

  const status = await svc.backupCodeStatus(userId)
  let backupCodes: string[] | null = null
  if (status.total === 0) {
    backupCodes = await svc.regenerateBackupCodes(userId)
  }
  return c.json({ ok: true, backupCodes })
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

/// Sigil for the MFA challenge methods chip on the login screen — used
/// by /auth/login to tell the client what to show after step 1.
export type MfaMethodSummary = {
  type: 'totp' | 'email'
  label: string | null
}
