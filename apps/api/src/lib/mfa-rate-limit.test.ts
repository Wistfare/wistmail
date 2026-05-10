/// In-memory fallback tests for the MFA confirm-endpoint rate limiter.
/// Redis-path is exercised in integration; here we lock down the
/// contract: 5 attempts allowed, 6th blocked, refund-on-success
/// frees a slot, and scopes are isolated.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  MFA_RATE_LIMIT_MAX,
  MFA_RATE_LIMIT_WINDOW_MS,
  _resetMfaRateLimitForTests,
  checkMfaRateLimit,
  refundMfaRateLimit,
} from './mfa-rate-limit.js'

describe('mfa-rate-limit (in-memory fallback)', () => {
  beforeEach(() => {
    _resetMfaRateLimitForTests()
    delete process.env.REDIS_URL
  })

  afterEach(() => {
    _resetMfaRateLimitForTests()
  })

  it('allows the first attempt and reports remaining', async () => {
    const r = await checkMfaRateLimit('u1', 'totp-confirm')
    expect(r.allowed).toBe(true)
    expect(r.attempt).toBe(1)
    expect(r.remaining).toBe(MFA_RATE_LIMIT_MAX - 1)
    expect(r.retryAfterMs).toBeGreaterThan(0)
    expect(r.retryAfterMs).toBeLessThanOrEqual(MFA_RATE_LIMIT_WINDOW_MS)
  })

  it('allows up to MAX attempts and blocks the next one', async () => {
    for (let i = 1; i <= MFA_RATE_LIMIT_MAX; i++) {
      const r = await checkMfaRateLimit('user-cap', 'totp-confirm')
      expect(r.allowed).toBe(true)
      expect(r.attempt).toBe(i)
    }
    const blocked = await checkMfaRateLimit('user-cap', 'totp-confirm')
    expect(blocked.allowed).toBe(false)
    expect(blocked.attempt).toBe(MFA_RATE_LIMIT_MAX + 1)
    expect(blocked.remaining).toBe(0)
  })

  it('repeated blocked calls do not run the counter past the cap', async () => {
    for (let i = 0; i < MFA_RATE_LIMIT_MAX; i++) {
      await checkMfaRateLimit('hammer', 'totp-confirm')
    }
    // First over-cap call returns blocked.
    const a = await checkMfaRateLimit('hammer', 'totp-confirm')
    expect(a.allowed).toBe(false)
    // Second + third over-cap also blocked, never silently re-allowing.
    const b = await checkMfaRateLimit('hammer', 'totp-confirm')
    const c = await checkMfaRateLimit('hammer', 'totp-confirm')
    expect(b.allowed).toBe(false)
    expect(c.allowed).toBe(false)
  })

  it('isolates buckets per (user, scope)', async () => {
    for (let i = 0; i < MFA_RATE_LIMIT_MAX; i++) {
      await checkMfaRateLimit('shared', 'totp-confirm')
    }
    const blockedTotp = await checkMfaRateLimit('shared', 'totp-confirm')
    expect(blockedTotp.allowed).toBe(false)

    // Same user, different scope — fresh bucket.
    const okEmail = await checkMfaRateLimit('shared', 'email-confirm')
    expect(okEmail.allowed).toBe(true)
    expect(okEmail.attempt).toBe(1)

    // Different user, same scope — also fresh.
    const okOther = await checkMfaRateLimit('other-user', 'totp-confirm')
    expect(okOther.allowed).toBe(true)
    expect(okOther.attempt).toBe(1)
  })

  it('refundMfaRateLimit frees a slot and never goes negative', async () => {
    const a = await checkMfaRateLimit('refund', 'totp-confirm')
    expect(a.attempt).toBe(1)
    await refundMfaRateLimit('refund', 'totp-confirm')
    const b = await checkMfaRateLimit('refund', 'totp-confirm')
    // After the refund, this should be attempt 1 again (back to 0 then INCR to 1).
    expect(b.attempt).toBe(1)

    // Several refunds in a row from a count of 1 must clamp at 0.
    await refundMfaRateLimit('refund', 'totp-confirm')
    await refundMfaRateLimit('refund', 'totp-confirm')
    await refundMfaRateLimit('refund', 'totp-confirm')
    const c = await checkMfaRateLimit('refund', 'totp-confirm')
    expect(c.attempt).toBe(1)
  })

  it('triggers the block on the 6th attempt (cap=5)', async () => {
    expect(MFA_RATE_LIMIT_MAX).toBe(5)
    const userId = 'six-strikes'
    const results = []
    for (let i = 0; i < MFA_RATE_LIMIT_MAX + 1; i++) {
      results.push(await checkMfaRateLimit(userId, 'login-verify'))
    }
    expect(results.slice(0, 5).every((r) => r.allowed)).toBe(true)
    expect(results[5].allowed).toBe(false)
  })
})
