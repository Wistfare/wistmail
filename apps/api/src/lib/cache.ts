/**
 * Tiny Redis-backed read-through cache for hot per-user GET endpoints.
 *
 *   const data = await cached('today', userId, 30, () => buildToday(userId))
 *
 * - TTL is in seconds. Defaults are short (30s) — caching here is a
 *   latency optimization, not a consistency boundary. Realtime WS
 *   events are the actual freshness mechanism: subscribe to events and
 *   bust matching keys via `bustUser(userId, scope?)` when something
 *   user-visible changes.
 *
 * - Keys are namespaced `cache:<scope>:<userId>`. Wildcard busting uses
 *   `cache:*:<userId>` (one SCAN — Redis on a single user is small
 *   enough that this is fine).
 *
 * - When Redis isn't available, the cache is a pass-through. The
 *   builder runs every call. This keeps dev workflows working.
 */

import { getRedis } from './redis.js'

const KEY_PREFIX = 'cache:'

function key(scope: string, userId: string): string {
  return `${KEY_PREFIX}${scope}:${userId}`
}

export async function cached<T>(
  scope: string,
  userId: string,
  ttlSeconds: number,
  build: () => Promise<T>,
): Promise<T> {
  const redis = getRedis()
  if (!redis) return build()

  const k = key(scope, userId)
  try {
    const hit = await redis.get(k)
    if (hit) {
      // The whole point — return without re-running the builder.
      return JSON.parse(hit) as T
    }
  } catch (err) {
    // A read failure should never poison the request — fall through.
    console.warn('[cache] read miss-fallback:', (err as Error).message)
  }

  const value = await build()
  try {
    await redis.set(k, JSON.stringify(value), 'EX', ttlSeconds)
  } catch (err) {
    console.warn('[cache] write skipped:', (err as Error).message)
  }
  return value
}

/**
 * Invalidate one or every cache key for a user. Pass a scope to bust
 * one entry; omit it to wipe all of the user's cache (used on
 * email.new where most reads are stale).
 */
export async function bustUser(userId: string, scope?: string): Promise<void> {
  const redis = getRedis()
  if (!redis) return

  if (scope) {
    await redis.del(key(scope, userId))
    return
  }

  // SCAN with a per-user prefix — bounded set, never blocks.
  const stream = redis.scanStream({ match: `${KEY_PREFIX}*:${userId}`, count: 100 })
  const toDelete: string[] = []
  for await (const keys of stream as AsyncIterable<string[]>) {
    toDelete.push(...keys)
  }
  if (toDelete.length > 0) {
    await redis.del(...toDelete)
  }
}
