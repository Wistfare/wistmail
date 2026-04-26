/// Short-lived, narrowly-scoped credentials for notification action
/// buttons. Issued by the API alongside an FCM push so a phone's
/// `BroadcastReceiver` (Android) or Notification Service Extension
/// (iOS) can act on the notification — reply, mark read — without
/// access to the user's session cookie.
///
/// Format is a compact HMAC-signed token (header-less JWT-equivalent):
///   `<base64url(payload)>.<base64url(hmac256(secret, payload))>`
/// We don't pull in the `jsonwebtoken` package because:
///   - We only ever issue + verify on the server side.
///   - The `crypto.createHmac` primitive is already used elsewhere.
///   - One less dep on the supply-chain.
///
/// One-shot replay protection: every token's `jti` lands in a Redis
/// deny-list on first use. Subsequent attempts to redeem the same
/// token are rejected. When Redis is unconfigured we fall back to a
/// stricter policy (treat every token as one-use anyway, but the
/// deny-list is a no-op so a determined attacker with a stolen
/// short-lived token could replay until expiry — flagged in code).

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { getRedis } from '../lib/redis.js'

export type NotificationTokenScope = 'reply' | 'read'
export type NotificationTokenResource = 'email' | 'chat'

interface TokenPayload {
  /// Token id — used as the Redis deny-list key. 16 random bytes hex.
  jti: string
  /// User the token was issued to. The action endpoints stamp this
  /// onto the resulting reply / read action.
  userId: string
  /// What the token can act on (email message id or chat conversation id).
  resourceType: NotificationTokenResource
  resourceId: string
  /// What the token can do.
  scope: NotificationTokenScope
  /// Issued-at and expires-at, seconds since epoch.
  iat: number
  exp: number
}

const DEFAULT_TTL_SECONDS = 24 * 60 * 60 // 24h
const DENY_LIST_PREFIX = 'notif-token:redeemed:'

function getSecret(): string {
  const s = process.env.JWT_SECRET
  if (!s || s.length < 8) {
    throw new Error('JWT_SECRET is required to mint notification tokens')
  }
  return s
}

function base64UrlEncode(buf: Buffer): string {
  return buf
    .toString('base64')
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

function base64UrlDecode(s: string): Buffer {
  const padded = s + '='.repeat((4 - (s.length % 4)) % 4)
  return Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
}

/// Mint a single token. Caller is responsible for not handing out
/// tokens with broader scopes than necessary — pre-issue ONE token
/// per (resource, scope) pair, never one big "do anything" token.
export function issueNotificationToken(input: {
  userId: string
  resourceType: NotificationTokenResource
  resourceId: string
  scope: NotificationTokenScope
  ttlSeconds?: number
}): { token: string; jti: string; expiresAt: Date } {
  const now = Math.floor(Date.now() / 1000)
  const ttl = input.ttlSeconds ?? DEFAULT_TTL_SECONDS
  const payload: TokenPayload = {
    jti: randomBytes(16).toString('hex'),
    userId: input.userId,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    scope: input.scope,
    iat: now,
    exp: now + ttl,
  }
  const body = base64UrlEncode(Buffer.from(JSON.stringify(payload)))
  const sig = base64UrlEncode(
    createHmac('sha256', getSecret()).update(body).digest(),
  )
  return {
    token: `${body}.${sig}`,
    jti: payload.jti,
    expiresAt: new Date(payload.exp * 1000),
  }
}

export interface VerifiedNotificationToken {
  jti: string
  userId: string
  resourceType: NotificationTokenResource
  resourceId: string
  scope: NotificationTokenScope
  expiresAt: Date
}

export class NotificationTokenError extends Error {
  constructor(
    public readonly code:
      | 'malformed'
      | 'bad-signature'
      | 'expired'
      | 'redeemed',
    message: string,
  ) {
    super(message)
  }
}

/// Verify the wire format + HMAC + expiry. Does NOT check or mutate
/// the deny-list — call `redeemNotificationToken` for that. Splitting
/// the two halves lets read-only callers (e.g. a "is this token still
/// good?" probe) check without consuming the one-shot.
export function verifyNotificationToken(
  raw: string,
  now: Date = new Date(),
): VerifiedNotificationToken {
  const parts = raw.split('.')
  if (parts.length !== 2) {
    throw new NotificationTokenError('malformed', 'Token must be body.sig')
  }
  const [body, sig] = parts
  const expected = base64UrlEncode(
    createHmac('sha256', getSecret()).update(body).digest(),
  )
  // timingSafeEqual on equal-length buffers — both base64url so
  // length matches when valid. A length mismatch alone tells us
  // the sig is wrong; bail before timingSafeEqual to avoid throwing.
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new NotificationTokenError('bad-signature', 'Bad signature')
  }

  let payload: TokenPayload
  try {
    payload = JSON.parse(base64UrlDecode(body).toString('utf8')) as TokenPayload
  } catch {
    throw new NotificationTokenError('malformed', 'Body is not JSON')
  }

  if (
    typeof payload.jti !== 'string' ||
    typeof payload.userId !== 'string' ||
    typeof payload.resourceType !== 'string' ||
    typeof payload.resourceId !== 'string' ||
    typeof payload.scope !== 'string' ||
    typeof payload.exp !== 'number'
  ) {
    throw new NotificationTokenError('malformed', 'Missing required claims')
  }

  if (payload.exp * 1000 <= now.getTime()) {
    throw new NotificationTokenError('expired', 'Token expired')
  }

  return {
    jti: payload.jti,
    userId: payload.userId,
    resourceType: payload.resourceType as NotificationTokenResource,
    resourceId: payload.resourceId,
    scope: payload.scope as NotificationTokenScope,
    expiresAt: new Date(payload.exp * 1000),
  }
}

/// Atomically claim a token's jti. Returns true if the redemption
/// succeeded (this caller is the first to use it), false if it was
/// already redeemed. Falls back to "always succeed" when Redis is
/// unconfigured — see the file-header comment for the security
/// trade-off there.
export async function redeemNotificationTokenJti(
  jti: string,
  expiresAt: Date,
): Promise<boolean> {
  // Expiry first so this layer is correct even without Redis. Without
  // it, the "no Redis" path would happily redeem expired tokens —
  // `verifyNotificationToken` catches that for the usual caller, but
  // direct callers shouldn't have to know.
  const ttlMs = Math.max(0, expiresAt.getTime() - Date.now())
  if (ttlMs === 0) return false

  const redis = getRedis()
  if (!redis) return true

  const key = DENY_LIST_PREFIX + jti
  // SET NX + PX gives us atomic "claim if not present, expire at TTL".
  const result = await redis.set(key, '1', 'PX', ttlMs, 'NX')
  return result === 'OK'
}

/// Convenience wrapper: verify + redeem in one go. Throws on the
/// usual failure modes; callers translate to HTTP status.
export async function consumeNotificationToken(
  raw: string,
  now: Date = new Date(),
): Promise<VerifiedNotificationToken> {
  const verified = verifyNotificationToken(raw, now)
  const claimed = await redeemNotificationTokenJti(
    verified.jti,
    verified.expiresAt,
  )
  if (!claimed) {
    throw new NotificationTokenError('redeemed', 'Token already used')
  }
  return verified
}
