import { createMiddleware } from 'hono/factory'
import { RateLimitError, RATE_LIMIT_DEFAULT } from '@wistmail/shared'
import type { AppEnv } from '../app.js'

// In-memory rate limiter (replace with Redis in production)
const rateLimitStore = new Map<string, { count: number; resetAt: number }>()

/**
 * Rate limiting middleware.
 * Limits requests per second per API key.
 */
export function rateLimit(maxRequests: number = RATE_LIMIT_DEFAULT, windowMs: number = 1000) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const key = c.get('apiKeyId') || c.req.header('x-forwarded-for') || 'anonymous'
    const now = Date.now()

    let entry = rateLimitStore.get(key)
    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs }
      rateLimitStore.set(key, entry)
    }

    entry.count++

    if (entry.count > maxRequests) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000)
      c.header('Retry-After', String(retryAfter))
      c.header('X-RateLimit-Limit', String(maxRequests))
      c.header('X-RateLimit-Remaining', '0')
      c.header('X-RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)))
      throw new RateLimitError(retryAfter)
    }

    c.header('X-RateLimit-Limit', String(maxRequests))
    c.header('X-RateLimit-Remaining', String(maxRequests - entry.count))
    c.header('X-RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)))

    await next()
  })
}

// Clean up expired entries periodically
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of rateLimitStore) {
    if (now > entry.resetAt) {
      rateLimitStore.delete(key)
    }
  }
}, 60000)
