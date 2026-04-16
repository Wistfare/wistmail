import { createMiddleware } from 'hono/factory'
import { createHash } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { AuthenticationError, AuthorizationError } from '@wistmail/shared'
import { apiKeys } from '@wistmail/db'
import { getDb } from '../lib/db.js'
import type { AppEnv } from '../app.js'

/**
 * API key authentication middleware.
 * Expects: X-API-Key: wm_xxxxx
 */
export const apiKeyAuth = createMiddleware<AppEnv>(async (c, next) => {
  const apiKey = c.req.header('X-API-Key')
  if (!apiKey) {
    throw new AuthenticationError('Missing X-API-Key header')
  }

  if (!apiKey.startsWith('wm_')) {
    throw new AuthenticationError('Invalid API key format')
  }

  const keyHash = hashApiKey(apiKey)
  const db = getDb()

  // Look up key in database by hash
  const result = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.keyHash, keyHash))
    .limit(1)

  if (result.length === 0) {
    throw new AuthenticationError('Invalid API key')
  }

  const key = result[0]

  // Check expiration
  if (key.expiresAt && new Date() > key.expiresAt) {
    throw new AuthenticationError('API key has expired')
  }

  // Set context
  c.set('userId', key.userId)
  c.set('apiKeyId', key.id)
  c.set('scopes', (key.scopes as string[]) || [])

  // Update lastUsedAt in background (don't block the request)
  db.update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, key.id))
    .catch(() => {})

  await next()
})

/**
 * Scope check middleware factory.
 */
export function requireScope(scope: string) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const scopes = c.get('scopes')
    if (!scopes.includes(scope)) {
      throw new AuthorizationError(`API key does not have the '${scope}' scope`)
    }
    await next()
  })
}

/**
 * Hash an API key for secure storage/lookup.
 */
export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex')
}
