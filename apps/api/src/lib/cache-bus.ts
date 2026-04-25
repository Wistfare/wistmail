/**
 * Cross-process cache invalidation. The API subscribes to a Redis
 * pub/sub channel; anything that writes user-visible state — including
 * the AI worker — publishes a `{userId, scope?}` message and the API
 * busts matching cache keys.
 *
 * Two senders:
 *  1. In-process: any code path that calls `bustUser()` directly. Used
 *     by request-side mutations.
 *  2. Out-of-process: the AI worker, which publishes via the same
 *     channel after writing classify/label/draft results.
 *
 * The in-process eventBus also relays each realtime event into a
 * cache bust — keeps WS and cache freshness tied to the same trigger.
 */

import { getRedis } from './redis.js'
import { bustUser } from './cache.js'

const CHANNEL = 'wm:cache-bust'

export async function publishBust(userId: string, scope?: string): Promise<void> {
  // Always bust locally — the publish path may be the same process.
  await bustUser(userId, scope).catch(() => {})
  const redis = getRedis()
  if (!redis) return
  try {
    await redis.publish(CHANNEL, JSON.stringify({ userId, scope }))
  } catch (err) {
    console.warn('[cache-bus] publish failed:', (err as Error).message)
  }
}

let started = false

/**
 * Wire up the API's cache invalidation. Call once at boot.
 * Idempotent — safe to call from tests.
 */
export function startCacheBus(): void {
  if (started) return
  started = true

  const redis = getRedis()
  if (!redis) return

  // Use a duplicate connection for SUBSCRIBE — the main client must
  // stay free for normal commands while subscribed connections block.
  // Override `enableOfflineQueue: true` so subscribe queues until
  // the connection is ready (the main client uses `false` to fail
  // commands fast on outage; for a long-lived subscriber we want
  // the opposite).
  const sub = redis.duplicate({ enableOfflineQueue: true })
  sub.subscribe(CHANNEL).catch((err) => {
    console.warn('[cache-bus] subscribe failed:', err)
  })
  sub.on('message', (_channel: string, raw: string) => {
    try {
      const { userId, scope } = JSON.parse(raw) as { userId: string; scope?: string }
      bustUser(userId, scope).catch(() => {})
    } catch {
      // Bad payload — ignore. The cost of a wrong bust is just a refetch.
    }
  })
}
