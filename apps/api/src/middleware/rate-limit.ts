import { createMiddleware } from 'hono/factory'
import { RateLimitError, RATE_LIMIT_DEFAULT } from '@wistmail/shared'
import type { AppEnv } from '../app.js'
import { getRedis } from '../lib/redis.js'

/// Rate limiter. Production path is Redis-backed (atomic INCR + EXPIRE in
/// a single round-trip via a Lua script) so it scales horizontally.
/// Falls back to an in-process Map for local dev / tests where Redis isn't
/// available — same behavior, just not shared between instances.

interface InMemoryEntry {
  count: number
  resetAt: number
}

const memoryStore = new Map<string, InMemoryEntry>()
let memoryGcTimer: NodeJS.Timeout | null = null

function startMemoryGc() {
  if (memoryGcTimer) return
  memoryGcTimer = setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of memoryStore) {
      if (now > entry.resetAt) memoryStore.delete(key)
    }
  }, 60_000)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = memoryGcTimer as any
  if (typeof t?.unref === 'function') t.unref()
}

export function _resetRateLimitForTests(): void {
  memoryStore.clear()
}

// Atomic increment + ttl-on-first-write Lua script. Returns [count, ttl_ms].
// Doing this in one round trip avoids the classic INCR/EXPIRE race.
const RATE_LIMIT_LUA = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
return {current, ttl}
`

async function hitRedis(
  key: string,
  windowMs: number,
): Promise<{ count: number; ttlMs: number } | null> {
  const redis = getRedis()
  if (!redis) return null
  try {
    const result = (await redis.eval(
      RATE_LIMIT_LUA,
      1,
      `rl:${key}`,
      String(windowMs),
    )) as [number, number]
    return { count: Number(result[0]), ttlMs: Number(result[1]) }
  } catch (err) {
    // Fall back to in-memory rather than 500ing the whole API on a
    // transient Redis blip.
    console.error('[rate-limit] redis eval failed, falling back to memory:', err)
    return null
  }
}

function hitMemory(key: string, windowMs: number): { count: number; ttlMs: number } {
  startMemoryGc()
  const now = Date.now()
  let entry = memoryStore.get(key)
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + windowMs }
    memoryStore.set(key, entry)
  }
  entry.count++
  return { count: entry.count, ttlMs: entry.resetAt - now }
}

export function rateLimit(
  maxRequests: number = RATE_LIMIT_DEFAULT,
  windowMs: number = 1000,
) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const key = c.get('apiKeyId') || c.req.header('x-forwarded-for') || 'anonymous'

    const fromRedis = await hitRedis(key, windowMs)
    const { count, ttlMs } = fromRedis ?? hitMemory(key, windowMs)
    const resetSec = Math.ceil((Date.now() + Math.max(ttlMs, 0)) / 1000)

    if (count > maxRequests) {
      const retryAfter = Math.max(1, Math.ceil(ttlMs / 1000))
      c.header('Retry-After', String(retryAfter))
      c.header('X-RateLimit-Limit', String(maxRequests))
      c.header('X-RateLimit-Remaining', '0')
      c.header('X-RateLimit-Reset', String(resetSec))
      throw new RateLimitError(retryAfter)
    }

    c.header('X-RateLimit-Limit', String(maxRequests))
    c.header('X-RateLimit-Remaining', String(Math.max(0, maxRequests - count)))
    c.header('X-RateLimit-Reset', String(resetSec))

    await next()
  })
}
