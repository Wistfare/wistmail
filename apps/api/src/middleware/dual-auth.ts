import { createMiddleware } from 'hono/factory'
import { getCookie } from 'hono/cookie'
import { eq } from 'drizzle-orm'
import { AuthenticationError } from '@wistmail/shared'
import { apiKeys } from '@wistmail/db'
import { AuthService } from '../services/auth.js'
import { hashApiKey } from './auth.js'
import { getDb } from '../lib/db.js'

export type DualAuthEnv = {
  Variables: {
    userId: string
    apiKeyId: string | null
    scopes: string[]
    authMethod: 'api_key' | 'session'
  }
}

/**
 * Middleware that accepts EITHER an API key (X-API-Key header) OR a session
 * cookie (wm_session). Lets dashboard users AND SDK users hit the same routes.
 *
 * - API key auth: sets userId + apiKeyId + scopes
 * - Session auth: sets userId + all scopes (dashboard has full access)
 */
export const dualAuth = createMiddleware<DualAuthEnv>(async (c, next) => {
  const db = getDb()

  // Try API key first
  const apiKey = c.req.header('X-API-Key')
  if (apiKey) {
    if (!apiKey.startsWith('wm_')) {
      throw new AuthenticationError('Invalid API key format')
    }

    const keyHash = hashApiKey(apiKey)
    const result = await db.select().from(apiKeys).where(eq(apiKeys.keyHash, keyHash)).limit(1)

    if (result.length === 0) {
      throw new AuthenticationError('Invalid API key')
    }

    const key = result[0]
    if (key.expiresAt && new Date() > key.expiresAt) {
      throw new AuthenticationError('API key has expired')
    }

    c.set('userId', key.userId)
    c.set('apiKeyId', key.id)
    c.set('scopes', (key.scopes as string[]) || [])
    c.set('authMethod', 'api_key')

    // Update lastUsedAt without blocking
    db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, key.id)).catch(() => {})

    return next()
  }

  // Fallback: session cookie
  const token = getCookie(c, 'wm_session')
  if (!token) {
    throw new AuthenticationError('Missing X-API-Key header or session cookie')
  }

  const auth = new AuthService(db)
  const session = await auth.validateSession(token)

  if (!session) {
    throw new AuthenticationError('Session expired')
  }

  c.set('userId', session.userId)
  c.set('apiKeyId', null)
  // Session users have all scopes (dashboard access)
  c.set('scopes', ['emails:send', 'emails:read', 'domains:manage', 'webhooks:manage', 'contacts:manage'])
  c.set('authMethod', 'session')

  await next()
})

/**
 * Scope check that works with dualAuth — always passes for session users.
 */
export function requireScope(scope: string) {
  return createMiddleware<DualAuthEnv>(async (c, next) => {
    const scopes = c.get('scopes')
    if (!scopes.includes(scope)) {
      throw new AuthenticationError(`API key does not have the '${scope}' scope`)
    }
    await next()
  })
}
