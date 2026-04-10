import { createMiddleware } from 'hono/factory'
import { getCookie } from 'hono/cookie'
import { eq } from 'drizzle-orm'
import { AuthenticationError } from '@wistmail/shared'
import { orgMembers } from '@wistmail/db'
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

export const sessionAuth = createMiddleware<SessionEnv>(async (c, next) => {
  const token = getCookie(c, 'wm_session')
  if (!token) {
    throw new AuthenticationError('Not authenticated')
  }

  const db = getDb()
  const auth = new AuthService(db)
  const result = await auth.validateSession(token)

  if (!result) {
    throw new AuthenticationError('Session expired')
  }

  c.set('userId', result.userId)
  c.set('user', result.user)

  // Resolve org membership
  const membership = await db
    .select()
    .from(orgMembers)
    .where(eq(orgMembers.userId, result.userId))
    .limit(1)

  if (membership.length > 0) {
    c.set('orgId', membership[0].orgId)
    c.set('orgRole', membership[0].role)
  } else {
    c.set('orgId', '')
    c.set('orgRole', '')
  }

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
