import { createMiddleware } from 'hono/factory'
import { getCookie } from 'hono/cookie'
import { AuthenticationError } from '@wistmail/shared'
import { AuthService } from '../services/auth.js'
import { getDb } from '../lib/db.js'

export type SessionEnv = {
  Variables: {
    userId: string
    user: { id: string; name: string; email: string; avatarUrl: string | null }
  }
}

export const sessionAuth = createMiddleware<SessionEnv>(async (c, next) => {
  const token = getCookie(c, 'wm_session')
  if (!token) {
    throw new AuthenticationError('Not authenticated')
  }

  const db = getDb()
  const auth = new AuthService(db)
  const result = await auth.validateSession(token)

  if (!result) {
    throw new AuthenticationError('Session expired')
  }

  c.set('userId', result.userId)
  c.set('user', result.user)
  await next()
})
