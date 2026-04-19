import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'
import { TOTP, Secret } from 'otpauth'
import { and, eq, gt, isNull, lt } from 'drizzle-orm'
import {
  mfaMethods,
  mfaBackupCodes,
  mfaPendingLogins,
  mfaEmailCodes,
  users,
} from '@wistmail/db'
import type { Database } from '@wistmail/db'
import { generateId } from '@wistmail/shared'
import { decryptSecret, encryptSecret } from '../lib/secret-crypto.js'
import { buildMfaCodeEmail } from '../templates/mfa-code.js'

export const MFA_TYPE_TOTP = 'totp'
export const MFA_TYPE_EMAIL = 'email'

const TOTP_ISSUER = 'Wistfare Mail'
const BACKUP_CODE_COUNT = 10
const BACKUP_CODE_GROUPS = 2
const BACKUP_CODE_GROUP_LEN = 4
const BACKUP_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const PENDING_LOGIN_TTL_MS = 5 * 60 * 1000
const EMAIL_CODE_TTL_MS = 10 * 60 * 1000
const MAX_PENDING_ATTEMPTS = 5

const MAIL_ENGINE_URL = process.env.MAIL_ENGINE_URL || 'http://mail-engine:8025'
const INBOUND_SECRET = process.env.INBOUND_SECRET || ''

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function safeStringEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a)
  const bBuf = Buffer.from(b)
  if (aBuf.length !== bBuf.length) return false
  return timingSafeEqual(aBuf, bBuf)
}

export interface PendingLogin {
  pendingToken: string
  pendingId: string
  expiresAt: Date
}

export interface TotpSetupResult {
  methodId: string
  secret: string
  otpauthUrl: string
}

export class MfaService {
  constructor(private readonly db: Database) {}

  // ── User helpers ──────────────────────────────────────────────────────

  async hasVerifiedMethod(userId: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: mfaMethods.id })
      .from(mfaMethods)
      .where(and(eq(mfaMethods.userId, userId), eq(mfaMethods.verified, 'true')))
      .limit(1)
    return rows.length > 0
  }

  async listMethods(userId: string) {
    const rows = await this.db
      .select({
        id: mfaMethods.id,
        type: mfaMethods.type,
        label: mfaMethods.label,
        verified: mfaMethods.verified,
        lastUsedAt: mfaMethods.lastUsedAt,
        createdAt: mfaMethods.createdAt,
      })
      .from(mfaMethods)
      .where(eq(mfaMethods.userId, userId))
    return rows.map((r) => ({ ...r, verified: r.verified === 'true' }))
  }

  async deleteMethod(userId: string, methodId: string): Promise<void> {
    await this.db
      .delete(mfaMethods)
      .where(and(eq(mfaMethods.id, methodId), eq(mfaMethods.userId, userId)))
    // If no verified methods remain, flip mfa_setup_complete back to false
    // so the user is prompted to re-enroll.
    if (!(await this.hasVerifiedMethod(userId))) {
      await this.db
        .update(users)
        .set({ mfaSetupComplete: false, updatedAt: new Date() })
        .where(eq(users.id, userId))
    }
  }

  // ── TOTP setup ────────────────────────────────────────────────────────

  async beginTotpSetup(userId: string, accountLabel: string): Promise<TotpSetupResult> {
    // Reuse an existing unverified TOTP row if present so refreshes don't
    // pile up dead rows.
    const existing = await this.db
      .select()
      .from(mfaMethods)
      .where(
        and(
          eq(mfaMethods.userId, userId),
          eq(mfaMethods.type, MFA_TYPE_TOTP),
          eq(mfaMethods.verified, 'false'),
        ),
      )
      .limit(1)

    let methodId: string
    let secret: string
    if (existing.length > 0) {
      methodId = existing[0].id
      secret = decryptSecret(existing[0].secretEncrypted)
    } else {
      // 20 random bytes → standard TOTP secret length
      secret = new Secret({ size: 20 }).base32
      methodId = generateId('mfa')
      await this.db.insert(mfaMethods).values({
        id: methodId,
        userId,
        type: MFA_TYPE_TOTP,
        secretEncrypted: encryptSecret(secret),
        verified: 'false',
      })
    }

    const totp = new TOTP({
      issuer: TOTP_ISSUER,
      label: accountLabel,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: Secret.fromBase32(secret),
    })
    return { methodId, secret, otpauthUrl: totp.toString() }
  }

  async verifyTotpSetup(
    userId: string,
    methodId: string,
    code: string,
  ): Promise<boolean> {
    const row = await this.db
      .select()
      .from(mfaMethods)
      .where(
        and(
          eq(mfaMethods.id, methodId),
          eq(mfaMethods.userId, userId),
          eq(mfaMethods.type, MFA_TYPE_TOTP),
        ),
      )
      .limit(1)
    if (row.length === 0) return false

    const ok = this.checkTotp(row[0].secretEncrypted, code)
    if (!ok) return false

    await this.db
      .update(mfaMethods)
      .set({ verified: 'true', lastUsedAt: new Date() })
      .where(eq(mfaMethods.id, methodId))

    await this.db
      .update(users)
      .set({ mfaSetupComplete: true, updatedAt: new Date() })
      .where(eq(users.id, userId))

    return true
  }

  private checkTotp(encryptedSecret: string, code: string): boolean {
    const trimmed = code.replace(/\s+/g, '')
    if (!/^\d{6}$/.test(trimmed)) return false
    const secret = decryptSecret(encryptedSecret)
    const totp = new TOTP({
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: Secret.fromBase32(secret),
    })
    // Allow ±1 step (30s) to handle clock skew.
    const delta = totp.validate({ token: trimmed, window: 1 })
    return delta !== null
  }

  // ── Email-as-MFA setup ────────────────────────────────────────────────

  /// Start email-MFA setup: create (or reuse) an unverified method row and
  /// dispatch a one-time code to the address.
  async beginEmailSetup(
    userId: string,
    address: string,
    orgName: string,
    fromDomain: string,
    displayName: string,
  ): Promise<string> {
    const normalized = address.trim().toLowerCase()

    const existing = await this.db
      .select()
      .from(mfaMethods)
      .where(
        and(
          eq(mfaMethods.userId, userId),
          eq(mfaMethods.type, MFA_TYPE_EMAIL),
        ),
      )
      .limit(1)

    let methodId: string
    if (existing.length > 0) {
      methodId = existing[0].id
      await this.db
        .update(mfaMethods)
        .set({
          secretEncrypted: encryptSecret(normalized),
          label: normalized,
          verified: 'false',
        })
        .where(eq(mfaMethods.id, methodId))
    } else {
      methodId = generateId('mfa')
      await this.db.insert(mfaMethods).values({
        id: methodId,
        userId,
        type: MFA_TYPE_EMAIL,
        secretEncrypted: encryptSecret(normalized),
        label: normalized,
        verified: 'false',
      })
    }

    await this.dispatchEmailCode(userId, normalized, 'setup', orgName, fromDomain, displayName)
    return methodId
  }

  async verifyEmailSetup(
    userId: string,
    methodId: string,
    code: string,
  ): Promise<boolean> {
    const ok = await this.consumeEmailCode(userId, 'setup', code)
    if (!ok) return false

    await this.db
      .update(mfaMethods)
      .set({ verified: 'true', lastUsedAt: new Date() })
      .where(and(eq(mfaMethods.id, methodId), eq(mfaMethods.userId, userId)))

    await this.db
      .update(users)
      .set({ mfaSetupComplete: true, updatedAt: new Date() })
      .where(eq(users.id, userId))

    return true
  }

  // ── Backup codes ─────────────────────────────────────────────────────

  async regenerateBackupCodes(userId: string): Promise<string[]> {
    await this.db.delete(mfaBackupCodes).where(eq(mfaBackupCodes.userId, userId))

    const codes: string[] = []
    for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
      codes.push(this.generateBackupCode())
    }

    const now = new Date()
    await this.db.insert(mfaBackupCodes).values(
      codes.map((c) => ({
        id: generateId('bcd'),
        userId,
        codeHash: sha256Hex(c.replace(/-/g, '').toUpperCase()),
        createdAt: now,
      })),
    )
    return codes
  }

  async backupCodeStatus(userId: string): Promise<{ remaining: number; total: number }> {
    const all = await this.db
      .select({ usedAt: mfaBackupCodes.usedAt })
      .from(mfaBackupCodes)
      .where(eq(mfaBackupCodes.userId, userId))
    return {
      total: all.length,
      remaining: all.filter((r) => r.usedAt === null).length,
    }
  }

  private async consumeBackupCode(userId: string, code: string): Promise<boolean> {
    const normalized = code.replace(/[^A-Z0-9]/gi, '').toUpperCase()
    if (normalized.length === 0) return false
    const hash = sha256Hex(normalized)

    const row = await this.db
      .select()
      .from(mfaBackupCodes)
      .where(
        and(
          eq(mfaBackupCodes.userId, userId),
          eq(mfaBackupCodes.codeHash, hash),
          isNull(mfaBackupCodes.usedAt),
        ),
      )
      .limit(1)

    if (row.length === 0) return false

    await this.db
      .update(mfaBackupCodes)
      .set({ usedAt: new Date() })
      .where(eq(mfaBackupCodes.id, row[0].id))
    return true
  }

  private generateBackupCode(): string {
    const groups: string[] = []
    for (let g = 0; g < BACKUP_CODE_GROUPS; g++) {
      let group = ''
      for (let i = 0; i < BACKUP_CODE_GROUP_LEN; i++) {
        group += BACKUP_CODE_ALPHABET[randomInt(BACKUP_CODE_ALPHABET.length)]
      }
      groups.push(group)
    }
    return groups.join('-')
  }

  // ── Email codes (setup + login challenge) ────────────────────────────

  async dispatchLoginEmailCode(
    userId: string,
    orgName: string,
    fromDomain: string,
    displayName: string,
  ): Promise<boolean> {
    const method = await this.db
      .select({ secret: mfaMethods.secretEncrypted, verified: mfaMethods.verified })
      .from(mfaMethods)
      .where(and(eq(mfaMethods.userId, userId), eq(mfaMethods.type, MFA_TYPE_EMAIL)))
      .limit(1)
    if (method.length === 0 || method[0].verified !== 'true') return false
    const address = decryptSecret(method[0].secret)
    await this.dispatchEmailCode(userId, address, 'login', orgName, fromDomain, displayName)
    return true
  }

  private async dispatchEmailCode(
    userId: string,
    recipient: string,
    purpose: 'setup' | 'login',
    orgName: string,
    fromDomain: string,
    displayName: string,
  ): Promise<void> {
    // Invalidate any earlier unconsumed codes for this purpose.
    await this.db
      .delete(mfaEmailCodes)
      .where(
        and(
          eq(mfaEmailCodes.userId, userId),
          eq(mfaEmailCodes.purpose, purpose),
          isNull(mfaEmailCodes.consumedAt),
        ),
      )

    const code = randomInt(0, 1_000_000).toString().padStart(6, '0')
    const expiresAt = new Date(Date.now() + EMAIL_CODE_TTL_MS)
    await this.db.insert(mfaEmailCodes).values({
      id: generateId('mec'),
      userId,
      purpose,
      codeHash: sha256Hex(code),
      expiresAt,
    })

    const { html, text } = buildMfaCodeEmail({
      displayName,
      code,
      orgName,
      purpose,
      expiresInMinutes: Math.round(EMAIL_CODE_TTL_MS / 60000),
    })
    fetch(`${MAIL_ENGINE_URL}/api/v1/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Inbound-Secret': INBOUND_SECRET,
      },
      body: JSON.stringify({
        from: `"${orgName}" <noreply@${fromDomain}>`,
        to: [recipient],
        subject:
          purpose === 'login'
            ? `Your ${orgName} sign-in code: ${code}`
            : `Verify your backup email — ${code}`,
        html,
        text,
      }),
    }).catch((err) => console.error('[mfa] email-code send failed:', err))
  }

  private async consumeEmailCode(
    userId: string,
    purpose: 'setup' | 'login',
    code: string,
  ): Promise<boolean> {
    const trimmed = code.replace(/\s+/g, '')
    if (!/^\d{6}$/.test(trimmed)) return false
    const hash = sha256Hex(trimmed)
    const now = new Date()

    const row = await this.db
      .select()
      .from(mfaEmailCodes)
      .where(
        and(
          eq(mfaEmailCodes.userId, userId),
          eq(mfaEmailCodes.purpose, purpose),
          eq(mfaEmailCodes.codeHash, hash),
          isNull(mfaEmailCodes.consumedAt),
          gt(mfaEmailCodes.expiresAt, now),
        ),
      )
      .limit(1)
    if (row.length === 0) return false

    await this.db
      .update(mfaEmailCodes)
      .set({ consumedAt: now })
      .where(eq(mfaEmailCodes.id, row[0].id))
    return true
  }

  // ── 2-step login flow ────────────────────────────────────────────────

  async createPendingLogin(userId: string): Promise<PendingLogin> {
    const rawToken = randomBytes(32).toString('hex')
    const tokenHash = sha256Hex(rawToken)
    const id = generateId('pen')
    const expiresAt = new Date(Date.now() + PENDING_LOGIN_TTL_MS)
    await this.db.insert(mfaPendingLogins).values({
      id,
      tokenHash,
      userId,
      expiresAt,
    })
    return { pendingToken: rawToken, pendingId: id, expiresAt }
  }

  /// Validate a pending token and consume one attempt slot. Returns the
  /// userId tied to the token, or null if invalid / expired / locked.
  async claimPendingLogin(rawToken: string): Promise<string | null> {
    if (!rawToken || rawToken.length < 16) return null
    const hash = sha256Hex(rawToken)
    const now = new Date()
    const row = await this.db
      .select()
      .from(mfaPendingLogins)
      .where(
        and(
          eq(mfaPendingLogins.tokenHash, hash),
          gt(mfaPendingLogins.expiresAt, now),
          lt(mfaPendingLogins.attempts, MAX_PENDING_ATTEMPTS),
        ),
      )
      .limit(1)
    if (row.length === 0) return null

    await this.db
      .update(mfaPendingLogins)
      .set({ attempts: row[0].attempts + 1 })
      .where(eq(mfaPendingLogins.id, row[0].id))
    return row[0].userId
  }

  async deletePendingLogin(rawToken: string): Promise<void> {
    const hash = sha256Hex(rawToken)
    await this.db.delete(mfaPendingLogins).where(eq(mfaPendingLogins.tokenHash, hash))
  }

  /// Try every viable factor for the user against the supplied code and
  /// return the type that matched (or null). Used by login + reset flows.
  async tryAnyFactor(
    userId: string,
    code: string,
  ): Promise<'totp' | 'email' | 'backup_code' | null> {
    const trimmed = code.replace(/\s+/g, '')

    // 1. TOTP
    const totp = await this.db
      .select({ id: mfaMethods.id, secret: mfaMethods.secretEncrypted })
      .from(mfaMethods)
      .where(
        and(
          eq(mfaMethods.userId, userId),
          eq(mfaMethods.type, MFA_TYPE_TOTP),
          eq(mfaMethods.verified, 'true'),
        ),
      )
      .limit(1)
    if (totp.length > 0 && this.checkTotp(totp[0].secret, trimmed)) {
      await this.db
        .update(mfaMethods)
        .set({ lastUsedAt: new Date() })
        .where(eq(mfaMethods.id, totp[0].id))
      return 'totp'
    }

    // 2. Email-MFA login code (only when ?method=email was used to dispatch one)
    if (await this.consumeEmailCode(userId, 'login', trimmed)) {
      const emailMethod = await this.db
        .select({ id: mfaMethods.id })
        .from(mfaMethods)
        .where(
          and(eq(mfaMethods.userId, userId), eq(mfaMethods.type, MFA_TYPE_EMAIL)),
        )
        .limit(1)
      if (emailMethod.length > 0) {
        await this.db
          .update(mfaMethods)
          .set({ lastUsedAt: new Date() })
          .where(eq(mfaMethods.id, emailMethod[0].id))
      }
      return 'email'
    }

    // 3. Backup code
    if (await this.consumeBackupCode(userId, trimmed)) {
      return 'backup_code'
    }

    return null
  }

  /// Compare two strings with constant time (re-exported for routes that
  /// need it, e.g. comparing user-supplied tokens).
  static safeEqual(a: string, b: string): boolean {
    return safeStringEqual(a, b)
  }
}
