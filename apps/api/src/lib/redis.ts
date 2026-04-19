/// Singleton Redis client. The connection is lazy: handlers that don't
/// use Redis won't open a socket. Anything that depends on Redis must
/// gracefully fall back if `getRedis()` returns null (REDIS_URL unset).

import Redis from 'ioredis'

let client: Redis | null = null
let initialized = false

export function getRedis(): Redis | null {
  if (initialized) return client
  initialized = true

  const url = process.env.REDIS_URL
  if (!url) {
    console.warn('[redis] REDIS_URL not set — Redis-dependent features disabled')
    return null
  }

  try {
    client = new Redis(url, {
      // Stay responsive on transient outages instead of crashing the
      // whole API. ioredis defaults to infinite retries which is fine,
      // but cap the per-attempt delay so we don't sleep forever.
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => Math.min(50 * 2 ** times, 2000),
      enableOfflineQueue: false,
      lazyConnect: false,
    })
    client.on('error', (err) => {
      console.error('[redis] connection error:', err.message)
    })
    return client
  } catch (err) {
    console.error('[redis] failed to initialize:', err)
    client = null
    return null
  }
}
