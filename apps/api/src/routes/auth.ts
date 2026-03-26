import { Hono } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { z } from 'zod'
import { ValidationError } from '@wistmail/shared'
import { AuthService } from '../services/auth.js'
import { getDb } from '../lib/db.js'

const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(255),
  email: z.string().email('Invalid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Must include an uppercase letter')
    .regex(/[a-z]/, 'Must include a lowercase letter')
    .regex(/\d/, 'Must include a number'),
})

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
})

const COOKIE_NAME = 'wm_session'
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60 // 30 days in seconds

export const authRoutes = new Hono()

/**
 * POST /api/v1/auth/register
 */
authRoutes.post('/register', async (c) => {
  const body = await c.req.json()
  const parsed = registerSchema.safeParse(body)

  if (!parsed.success) {
    throw new ValidationError('Invalid input', {
      errors: parsed.error.flatten().fieldErrors,
    })
  }

  const db = getDb()
  const auth = new AuthService(db)
  const { userId, session } = await auth.register(parsed.data)

  setCookie(c, COOKIE_NAME, session.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  })

  return c.json({ id: userId }, 201)
})

/**
 * POST /api/v1/auth/login
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
