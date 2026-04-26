import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import {
  consumeNotificationToken,
  issueNotificationToken,
  NotificationTokenError,
  redeemNotificationTokenJti,
  verifyNotificationToken,
} from './notification-tokens.js'

const ORIGINAL_SECRET = process.env.JWT_SECRET

beforeEach(() => {
  process.env.JWT_SECRET = 'test-secret-do-not-leak'
})
afterEach(() => {
  if (ORIGINAL_SECRET !== undefined) process.env.JWT_SECRET = ORIGINAL_SECRET
  else delete process.env.JWT_SECRET
})

describe('issueNotificationToken / verifyNotificationToken', () => {
  it('round-trips a valid token', () => {
    const minted = issueNotificationToken({
      userId: 'u_1',
      resourceType: 'email',
      resourceId: 'eml_1',
      scope: 'reply',
    })
    expect(minted.token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)

    const verified = verifyNotificationToken(minted.token)
    expect(verified.userId).toBe('u_1')
    expect(verified.resourceType).toBe('email')
    expect(verified.resourceId).toBe('eml_1')
    expect(verified.scope).toBe('reply')
    expect(verified.jti).toBe(minted.jti)
  })

  it('rejects a malformed token', () => {
    expect(() => verifyNotificationToken('not-a-token')).toThrowError(
      NotificationTokenError,
    )
    try {
      verifyNotificationToken('not-a-token')
    } catch (err) {
      expect((err as NotificationTokenError).code).toBe('malformed')
    }
  })

  it('rejects a token signed with a different secret', () => {
    const minted = issueNotificationToken({
      userId: 'u_1',
      resourceType: 'email',
      resourceId: 'eml_1',
      scope: 'reply',
    })
    process.env.JWT_SECRET = 'a-different-secret'
    expect(() => verifyNotificationToken(minted.token)).toThrowError(
      /signature/i,
    )
    try {
      verifyNotificationToken(minted.token)
    } catch (err) {
      expect((err as NotificationTokenError).code).toBe('bad-signature')
    }
  })

  it('rejects a tampered payload (sig no longer matches)', () => {
    const minted = issueNotificationToken({
      userId: 'u_1',
      resourceType: 'email',
      resourceId: 'eml_1',
      scope: 'reply',
    })
    // Flip the userId by editing the body before the dot. Re-encoding
    // the body without re-signing must fail verification.
    const [body, sig] = minted.token.split('.')
    const decoded = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    decoded.userId = 'u_attacker'
    const tamperedBody = Buffer.from(JSON.stringify(decoded))
      .toString('base64')
      .replace(/=+$/, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
    expect(() =>
      verifyNotificationToken(`${tamperedBody}.${sig}`),
    ).toThrowError(NotificationTokenError)
  })

  it('rejects an expired token', () => {
    const minted = issueNotificationToken({
      userId: 'u_1',
      resourceType: 'email',
      resourceId: 'eml_1',
      scope: 'reply',
      ttlSeconds: 60,
    })
    // Verify "now" two minutes after issue.
    const future = new Date(Date.now() + 2 * 60 * 1000)
    expect(() => verifyNotificationToken(minted.token, future)).toThrowError(
      /expired/i,
    )
  })

  it('refuses to issue when JWT_SECRET is missing', () => {
    delete process.env.JWT_SECRET
    expect(() =>
      issueNotificationToken({
        userId: 'u_1',
        resourceType: 'email',
        resourceId: 'eml_1',
        scope: 'reply',
      }),
    ).toThrow(/JWT_SECRET/)
  })
})

describe('redeemNotificationTokenJti / consumeNotificationToken', () => {
  it('first redeem succeeds, second redeem of the same jti fails', async () => {
    // No REDIS_URL in the test env → deny-list is a no-op AND the
    // helper returns true for every call. We can't lock in the
    // "second redeem fails" expectation without Redis, so guard it
    // with a Redis-availability check.
    const redisOn = !!process.env.REDIS_URL
    const minted = issueNotificationToken({
      userId: 'u_1',
      resourceType: 'email',
      resourceId: 'eml_1',
      scope: 'reply',
    })
    const a = await redeemNotificationTokenJti(minted.jti, minted.expiresAt)
    expect(a).toBe(true)
    const b = await redeemNotificationTokenJti(minted.jti, minted.expiresAt)
    if (redisOn) {
      expect(b).toBe(false)
    } else {
      // Without Redis the deny-list is an open door. Documented in
      // the file header — the test at least confirms the no-op path
      // doesn't throw.
      expect(b).toBe(true)
    }
  })

  it('refuses to redeem an already-expired jti', async () => {
    const past = new Date(Date.now() - 60_000)
    const ok = await redeemNotificationTokenJti('jti-expired', past)
    expect(ok).toBe(false)
  })

  it('consumeNotificationToken rejects already-redeemed token (with Redis)', async () => {
    if (!process.env.REDIS_URL) return
    const minted = issueNotificationToken({
      userId: 'u_1',
      resourceType: 'email',
      resourceId: 'eml_1',
      scope: 'reply',
    })
    await consumeNotificationToken(minted.token)
    await expect(consumeNotificationToken(minted.token)).rejects.toThrow(
      /already used/i,
    )
  })
})
