import { Hono } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { z } from 'zod'
import { ValidationError } from '@wistmail/shared'
import { AuthService } from '../services/auth.js'
import { getDb } from '../lib/db.js'

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
})

const COOKIE_NAME = 'wm_session'
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60 // 30 days in seconds

export const authRoutes = new Hono()

/**
 * POST /api/v1/auth/login
 * User logs in with their mailbox email (e.g., vedadom@wistfare.com)
 */
authRoutes.post('/login', async (c) => {
  const body = await c.req.json()
  const parsed = loginSchema.safeParse(body)

  if (!parsed.success) {
    throw new ValidationError('Invalid input', {
      errors: parsed.error.flatten().fieldErrors,
    })
  }

  const db = getDb()
  const auth = new AuthService(db)
  const { user, session } = await auth.login(parsed.data)

  setCookie(c, COOKIE_NAME, session.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  })

  return c.json({ user })
})

/**
 * GET /api/v1/auth/session
 * Validate session and return current user.
 */
authRoutes.get('/session', async (c) => {
  const token = getCookie(c, COOKIE_NAME)
  if (!token) {
    return c.json({ user: null }, 200)
  }

  const db = getDb()
  const auth = new AuthService(db)
  const result = await auth.validateSession(token)

  if (!result) {
    deleteCookie(c, COOKIE_NAME)
    return c.json({ user: null }, 200)
  }

  return c.json({ user: result.user })
})

/**
 * POST /api/v1/auth/logout
 */
authRoutes.post('/logout', async (c) => {
  const token = getCookie(c, COOKIE_NAME)
  if (token) {
    const db = getDb()
    const auth = new AuthService(db)
    await auth.logout(token)
  }

  deleteCookie(c, COOKIE_NAME)
  return c.json({ ok: true })
})
