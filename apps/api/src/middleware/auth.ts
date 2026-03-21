import { createMiddleware } from 'hono/factory'
import { createHash } from 'node:crypto'
import { AuthenticationError, AuthorizationError } from '@wistmail/shared'
import type { AppEnv } from '../app.js'

/**
 * API key authentication middleware.
 * Expects: Authorization: Bearer wm_xxxxx
 */
export const apiKeyAuth = createMiddleware<AppEnv>(async (c, next) => {
  const authHeader = c.req.header('Authorization')
  if (!authHeader) {
    throw new AuthenticationError('Missing Authorization header')
  }

  const parts = authHeader.split(' ')
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    throw new AuthenticationError('Invalid Authorization header format. Expected: Bearer <api_key>')
  }

  const apiKey = parts[1]
  if (!apiKey.startsWith('wm_')) {
    throw new AuthenticationError('Invalid API key format')
  }

  // Hash the key for database lookup
  const keyHash = hashApiKey(apiKey)

  // TODO: Look up key in database
  // For now, set placeholder values
  c.set('userId', 'placeholder')
  c.set('apiKeyId', keyHash)
  c.set('scopes', ['emails:send', 'emails:read', 'domains:manage', 'templates:manage', 'contacts:manage', 'webhooks:manage', 'analytics:read'])

  await next()
})

/**
 * Scope check middleware factory.
 * Ensures the API key has the required scope.
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
