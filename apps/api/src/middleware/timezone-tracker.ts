/**
 * Tracks the authenticated user's IANA timezone from a client header
 * and persists it lazily.
 *
 * The mobile client sends `X-Client-Timezone: Africa/Kigali` on every
 * request (Dio interceptor in apps/mobile). This middleware:
 *   - validates the header is a real IANA zone
 *   - updates `users.timezone` only when it differs from the
 *     in-process cache, AND a debounce window has passed
 *
 * The debounce keeps write amplification at "one UPDATE per user
 * per hour at most" even under heavy traffic. The AI worker reads
 * `users.timezone` to schedule the daily Today digest at the user's
 * local 04:00 — so the freshness only needs to be roughly correct,
 * not real-time.
 *
 * Mounted via `app.use('*', sessionAuth, timezoneTracker)` in
 * routes that already have a userId. No-op when the header is
 * missing or malformed (silent fallback to existing stored TZ).
 */

import { createMiddleware } from 'hono/factory'
import { eq } from 'drizzle-orm'
import { users } from '@wistmail/db'
import { getDb } from '../lib/db.js'
import type { SessionEnv } from './session-auth.js'

const DEBOUNCE_MS = 60 * 60 * 1000 // 1 hour

interface CacheEntry {
  tz: string
  lastWriteAt: number
}

const cache = new Map<string, CacheEntry>()

/// Cheap validation. Intl.supportedValuesOf('timeZone') was added in
/// Node 18; throwing TZ at the runtime via DateTimeFormat is the
/// portable fallback and faster on the hot path.
function isValidTimezone(tz: string): boolean {
  if (!tz || tz.length > 64 || !/^[A-Za-z_+\-/0-9]+$/.test(tz)) return false
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

export const timezoneTracker = createMiddleware<SessionEnv>(async (c, next) => {
  const userId = c.get('userId')
  const tz = c.req.header('x-client-timezone')

  if (userId && tz && isValidTimezone(tz)) {
    const now = Date.now()
    const cached = cache.get(userId)
    const stale = !cached || cached.tz !== tz || now - cached.lastWriteAt > DEBOUNCE_MS

    if (stale) {
      // Best-effort write — never block the request on this. A failure
      // here just means we'll try again on the next request.
      getDb()
        .update(users)
        .set({ timezone: tz })
        .where(eq(users.id, userId))
        .catch((err) => {
          console.warn('[tz-tracker] update failed:', (err as Error).message)
        })
      cache.set(userId, { tz, lastWriteAt: now })
    }
  }

  await next()
})

/// Test-only — drop the in-process debounce cache.
export function _resetTimezoneTrackerCache(): void {
  cache.clear()
}
