import { createMiddleware } from 'hono/factory'
import { getCookie } from 'hono/cookie'
import { AuthenticationError } from '@wistmail/shared'
import { AuthService } from '../services/auth.js'
import { getDb } from '../lib/db.js'

export type SessionEnv = {
  Variables: {
    userId: string
    orgId: string
    orgRole: string
    user: { id: string; name: string; email: string; avatarUrl: string | null }
  }
}

/// Single-query session auth. validateSession does one Postgres round-trip
/// (sessions ⨝ users ⨝ org_members) and surfaces every downstream flag.
/// No follow-up org lookup; no follow-up MFA lookup.
export const sessionAuth = createMiddleware<SessionEnv>(async (c, next) => {
  const token = getCookie(c, 'wm_session')
  if (!token) {
    throw new AuthenticationError('Not authenticated')
  }

  const auth = new AuthService(getDb())
  const result = await auth.validateSession(token)

  if (!result) {
    throw new AuthenticationError('Session expired')
  }

  c.set('userId', result.userId)
  c.set('user', result.user)
  c.set('orgId', result.orgId)
  c.set('orgRole', result.orgRole)

  await next()
})

/**
 * Middleware to require a specific org role.
 * Use after sessionAuth.
 */
export function requireRole(...roles: string[]) {
  return createMiddleware<SessionEnv>(async (c, next) => {
    const userRole = c.get('orgRole')
    if (!roles.includes(userRole)) {
      throw new AuthenticationError('Insufficient permissions')
    }
    await next()
  })
}
