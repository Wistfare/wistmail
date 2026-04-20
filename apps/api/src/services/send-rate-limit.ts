/// Per-user send rate limit. Replaces the old per-org credit gate.
///
/// Two windows enforced together — hourly + daily — so a burst can't
/// drain the daily budget in one minute and a steady drip can't fly
/// past the hourly ceiling. Both counters live in Redis with PEXPIRE
/// set on first INCR, identical to the API rate-limit middleware.
///
/// Returns `{ allowed: false, retryAfterMs, scope }` if either window
/// is exhausted; the caller maps that to a `rate_limited` send status
/// rather than throwing — the email stays in the user's drafts/outbox
/// and the SyncEngine retries when the window rolls over.

import { getRedis } from '../lib/redis.js'

export const SEND_LIMIT_PER_HOUR = parseInt(process.env.SEND_LIMIT_PER_HOUR || '100', 10)
export const SEND_LIMIT_PER_DAY = parseInt(process.env.SEND_LIMIT_PER_DAY || '500', 10)

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

export interface SendRateCheck {
  allowed: boolean
  /// Milliseconds until the next send is allowed (only meaningful when
  /// `allowed === false`). Floor 1s so callers don't busy-loop.
  retryAfterMs: number
  /// Which window blocked the send.
  scope: 'hour' | 'day' | null
  /// Counts after this attempt (for telemetry / "X / 100 sent this hour").
  hourCount: number
  dayCount: number
}

const RATE_LUA = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
return {current, ttl}
`

interface InMemoryEntry {
  count: number
  resetAt: number
}

const memoryStore = new Map<string, InMemoryEntry>()

function hitMemory(key: string, windowMs: number): { count: number; ttlMs: number } {
  const now = Date.now()
  let entry = memoryStore.get(key)
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + windowMs }
    memoryStore.set(key, entry)
  }
  entry.count += 1
  return { count: entry.count, ttlMs: entry.resetAt - now }
}

async function hitWindow(
  bucketKey: string,
  windowMs: number,
): Promise<{ count: number; ttlMs: number }> {
  const redis = getRedis()
  if (redis) {
    try {
      const result = (await redis.eval(
        RATE_LUA,
        1,
        bucketKey,
        String(windowMs),
      )) as [number, number]
      return { count: Number(result[0]), ttlMs: Number(result[1]) }
    } catch (err) {
      console.error('[send-rate-limit] redis eval failed, falling back to memory:', err)
    }
  }
  return hitMemory(bucketKey, windowMs)
}

/// Decrement a window counter — used to compensate when a send is
/// reserved by the limiter but the email is then rejected before the
/// HTTP layer can call into the engine. Without this the user would
/// "lose" a send-slot to a no-op.
async function decrementWindow(bucketKey: string): Promise<void> {
  const redis = getRedis()
  if (redis) {
    try {
      // DECR clamps at 0 by guarding with a Lua check — Redis itself
      // would happily go negative which would let later sends overshoot.
      await redis.eval(
        `local v = tonumber(redis.call('GET', KEYS[1])) or 0
         if v > 0 then redis.call('DECR', KEYS[1]) end
         return 1`,
        1,
        bucketKey,
      )
      return
    } catch (err) {
      console.error('[send-rate-limit] redis decr failed, falling back to memory:', err)
    }
  }
  const entry = memoryStore.get(bucketKey)
  if (entry && entry.count > 0) entry.count -= 1
}

/// Reserve one send slot for the user. Returns whether the send may
/// proceed; if blocked, the caller should mark the email
/// `status='rate_limited'` and surface the retry window to the user.
export async function checkAndReserveSend(userId: string): Promise<SendRateCheck> {
  const hourKey = `send:${userId}:h`
  const dayKey = `send:${userId}:d`

  // Increment in parallel — even if the hour limit is hit the daily
  // counter still ticks because Redis EVAL is atomic per key. We
  // refund whichever didn't actually authorize a send below.
  const [hour, day] = await Promise.all([
    hitWindow(hourKey, HOUR_MS),
    hitWindow(dayKey, DAY_MS),
  ])

  const hourBlocked = hour.count > SEND_LIMIT_PER_HOUR
  const dayBlocked = day.count > SEND_LIMIT_PER_DAY

  if (hourBlocked || dayBlocked) {
    // Refund both windows — neither send actually went through.
    await Promise.all([decrementWindow(hourKey), decrementWindow(dayKey)])
    const hourTtl = Math.max(1, hour.ttlMs)
    const dayTtl = Math.max(1, day.ttlMs)
    if (dayBlocked && (!hourBlocked || dayTtl > hourTtl)) {
      return {
        allowed: false,
        retryAfterMs: dayTtl,
        scope: 'day',
        hourCount: hour.count - 1,
        dayCount: day.count - 1,
      }
    }
    return {
      allowed: false,
      retryAfterMs: hourTtl,
      scope: 'hour',
      hourCount: hour.count - 1,
      dayCount: day.count - 1,
    }
  }

  return {
    allowed: true,
    retryAfterMs: 0,
    scope: null,
    hourCount: hour.count,
    dayCount: day.count,
  }
}

/// Compensate when the email send fails for non-quota reasons (network,
/// recipient bounce, etc) and the user shouldn't lose the slot.
export async function refundSend(userId: string): Promise<void> {
  await Promise.all([
    decrementWindow(`send:${userId}:h`),
    decrementWindow(`send:${userId}:d`),
  ])
}

/// Test-only — clear the in-memory fallback so tests don't bleed.
export function _resetSendRateLimitForTests(): void {
  memoryStore.clear()
}
