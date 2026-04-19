import { verify } from 'argon2'
import { randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { users, sessions, orgMembers } from '@wistmail/db'
import { generateId, AuthenticationError } from '@wistmail/shared'
import type { Database } from '@wistmail/db'

const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

export class AuthService {
  constructor(private db: Database) {}

  /// Validate email + password ONLY. Returns the user record on success.
  /// Used by both the legacy single-step login and the 2-step MFA login.
  async verifyCredentials(input: { email: string; password: string }) {
    const email = input.email.trim().toLowerCase()

    const result = await this.db.select().from(users).where(eq(users.email, email)).limit(1)
    if (result.length === 0) {
      throw new AuthenticationError('Invalid email or password')
    }
    const user = result[0]

    const valid = await verify(user.passwordHash, input.password)
    if (!valid) {
      throw new AuthenticationError('Invalid email or password')
    }
    return user
  }

  /// Issue a session for a userId that the caller has already authenticated.
  async beginSession(userId: string) {
    const session = await this.createSession(userId)
    const result = await this.db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
    const user = result[0]
    return {
      userId,
      session,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl,
        setupComplete: user.setupComplete,
        setupStep: user.setupStep,
        mfaRequired: user.mfaRequired,
        mfaSetupComplete: user.mfaSetupComplete,
      },
    }
  }

  /// Single-step login (no MFA). Kept for back-compat with any callers
  /// that don't go through the routes layer.
  async login(input: { email: string; password: string }) {
    const user = await this.verifyCredentials(input)
    return this.beginSession(user.id)
  }

  async validateSession(token: string) {
    const result = await this.db
      .select({
        sessionId: sessions.id,
        userId: sessions.userId,
        expiresAt: sessions.expiresAt,
        userName: users.name,
        userEmail: users.email,
        userAvatar: users.avatarUrl,
        setupComplete: users.setupComplete,
        setupStep: users.setupStep,
        role: orgMembers.role,
      })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .leftJoin(orgMembers, eq(orgMembers.userId, users.id))
      .where(eq(sessions.token, token))
      .limit(1)

    if (result.length === 0) return null

    const session = result[0]
    if (new Date() > session.expiresAt) {
      await this.db.delete(sessions).where(eq(sessions.token, token))
      return null
    }

    // Re-read MFA flags (they aren't in the joined select to keep the
    // query lean, and they can flip mid-session).
    const mfa = await this.db
      .select({
        mfaRequired: users.mfaRequired,
        mfaSetupComplete: users.mfaSetupComplete,
      })
      .from(users)
      .where(eq(users.id, session.userId))
      .limit(1)

    return {
      userId: session.userId,
      user: {
        id: session.userId,
        name: session.userName,
        email: session.userEmail,
        avatarUrl: session.userAvatar,
        setupComplete: session.setupComplete,
        setupStep: session.setupStep,
        role: session.role || 'member',
        mfaRequired: mfa[0]?.mfaRequired ?? true,
        mfaSetupComplete: mfa[0]?.mfaSetupComplete ?? false,
      },
    }
  }

  async logout(token: string) {
    await this.db.delete(sessions).where(eq(sessions.token, token))
  }

  private async createSession(userId: string) {
    const sessionId = generateId('ses')
    const token = randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS)

    await this.db.insert(sessions).values({
      id: sessionId,
      userId,
      token,
      expiresAt,
    })

    return { id: sessionId, token, expiresAt }
  }
}
