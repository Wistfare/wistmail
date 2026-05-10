/// MFA confirm-endpoint rate limiter.
///
/// Auth-critical surfaces (TOTP confirm, email confirm, login challenge)
/// must throttle brute-force code-guessing. The window is 60s sliding,
/// the cap is 5 attempts per (user, scope). Sixth attempt is blocked.
///
/// Production path uses Redis with an atomic INCR + PEXPIRE Lua script —
/// same shape as `services/send-rate-limit.ts` and the rate-limit
/// middleware. When Redis is unavailable (local dev, tests) we fall
/// back to a per-process Map. The key namespace is `mfa-rl:` so the
/// counters can be flushed independently of the global rate limit.

import { getRedis } from './redis.js'

export const MFA_RATE_LIMIT_MAX = 5
export const MFA_RATE_LIMIT_WINDOW_MS = 60 * 1000

/// Scopes are listed explicitly so a typo in the call site fails type
/// rather than silently creating a fresh bucket.
export type MfaRateLimitScope =
  | 'totp-confirm'
  | 'email-confirm'
  | 'login-verify'

export interface MfaRateLimitResult {
  allowed: boolean
  /// Attempt number this call represents. Equals `count` after the
  /// INCR. When `allowed` is false the attempt is NOT consumed — the
  /// limiter refunds the slot so a blocked caller doesn't push the
  /// counter past the cap.
  attempt: number
  remaining: number
  /// Milliseconds until the window resets. Floored at 1ms so callers
  /// can pass it to `Retry-After` without zero-second values.
  retryAfterMs: number
}

const RATE_LUA = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
return {current, ttl}
`

const REFUND_LUA = `
local v = tonumber(redis.call('GET', KEYS[1])) or 0
if v > 0 then redis.call('DECR', KEYS[1]) end
return 1
`

interface MemoryEntry {
  count: number
  resetAt: number
}

const memoryStore = new Map<string, MemoryEntry>()

function memoryKey(userId: string, scope: MfaRateLimitScope): string {
  return `mfa-rl:${scope}:${userId}`
}

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

function refundMemory(key: string): void {
  const entry = memoryStore.get(key)
  if (entry && entry.count > 0) entry.count -= 1
}

async function hitRedis(
  key: string,
  windowMs: number,
): Promise<{ count: number; ttlMs: number } | null> {
  const redis = getRedis()
  if (!redis) return null
  try {
    const result = (await redis.eval(RATE_LUA, 1, key, String(windowMs))) as [number, number]
    return { count: Number(result[0]), ttlMs: Number(result[1]) }
  } catch (err) {
    console.error('[mfa-rate-limit] redis eval failed, falling back to memory:', err)
    return null
  }
}

async function refundRedis(key: string): Promise<boolean> {
  const redis = getRedis()
  if (!redis) return false
  try {
    await redis.eval(REFUND_LUA, 1, key)
    return true
  } catch (err) {
    console.error('[mfa-rate-limit] redis refund failed, falling back to memory:', err)
    return false
  }
}

/// Reserve one attempt against (userId, scope). Returns `allowed: false`
/// once the cap is hit; the slot is refunded so subsequent blocked
/// attempts during the window still see `attempt === MAX + 1` rather
/// than runaway counters.
export async function checkMfaRateLimit(
  userId: string,
  scope: MfaRateLimitScope,
): Promise<MfaRateLimitResult> {
  const key = memoryKey(userId, scope)
  const fromRedis = await hitRedis(key, MFA_RATE_LIMIT_WINDOW_MS)
  const { count, ttlMs } = fromRedis ?? hitMemory(key, MFA_RATE_LIMIT_WINDOW_MS)

  if (count > MFA_RATE_LIMIT_MAX) {
    // Don't consume slots beyond the cap — refund so a blocked client
    // can't accidentally extend the window by hammering the endpoint.
    if (!(await refundRedis(key))) refundMemory(key)
    return {
      allowed: false,
      attempt: MFA_RATE_LIMIT_MAX + 1,
      remaining: 0,
      retryAfterMs: Math.max(1, ttlMs),
    }
  }

  return {
    allowed: true,
    attempt: count,
    remaining: Math.max(0, MFA_RATE_LIMIT_MAX - count),
    retryAfterMs: Math.max(1, ttlMs),
  }
}

/// Refund a previously-consumed attempt — call this on a successful
/// verification so a legitimate user doesn't pay for the slot they
/// just used. (Brute-force only matters for *failed* attempts.)
export async function refundMfaRateLimit(
  userId: string,
  scope: MfaRateLimitScope,
): Promise<void> {
  const key = memoryKey(userId, scope)
  if (!(await refundRedis(key))) refundMemory(key)
}

/// Test-only — flush the in-memory fallback so suites don't bleed.
export function _resetMfaRateLimitForTests(): void {
  memoryStore.clear()
}
