import { verify } from 'argon2'
import { randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { users, sessions, orgMembers } from '@wistmail/db'
import { generateId, AuthenticationError } from '@wistmail/shared'
import type { Database } from '@wistmail/db'

const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

export class AuthService {
  constructor(private db: Database) {}

  async login(input: { email: string; password: string }) {
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

    const session = await this.createSession(user.id)

    return {
      userId: user.id,
      session,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl,
        setupComplete: user.setupComplete,
        setupStep: user.setupStep,
      },
    }
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
