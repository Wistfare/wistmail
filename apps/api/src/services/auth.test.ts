import { describe, expect, it } from 'vitest'
import { app } from '../app.js'

/**
 * Auth service integration tests.
 * These require a running database. They are skipped when DATABASE_URL is not set.
 *
 * The auth routes (/api/v1/auth/*) do NOT use API key auth -- they use
 * email/password login and session cookies. We test them via the HTTP routes.
 */
const DB_URL = process.env.DATABASE_URL
const describeIf = DB_URL ? describe : describe.skip

describeIf('Auth Service (integration via routes)', () => {
  it('POST /api/v1/auth/login rejects with invalid email format', async () => {
    const res = await app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'not-an-email',
        password: 'somepassword123',
      }),
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })

  it('POST /api/v1/auth/login rejects with missing password', async () => {
    const res = await app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'user@example.com',
        password: '',
      }),
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })

  it('POST /api/v1/auth/login rejects with missing email', async () => {
    const res = await app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        password: 'somepassword123',
      }),
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })

  it('POST /api/v1/auth/login returns 401 for non-existent user', async () => {
    const res = await app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'nonexistent@example.com',
        password: 'wrongpassword123',
      }),
    })
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error.code).toBe('UNAUTHORIZED')
    expect(body.error.message).toContain('Invalid email or password')
  })

  it('POST /api/v1/auth/login returns 401 for wrong password', async () => {
    // This test assumes a test user exists in the DB
    const res = await app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'test@wistfare.com',
        password: 'definitely_wrong_password',
      }),
    })
    // Either 401 (user exists, wrong password) or 401 (user not found)
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error.code).toBe('UNAUTHORIZED')
  })
})

describe('Auth Routes (no DB required)', () => {
  it('GET /api/v1/auth/session returns null user without cookie', async () => {
    const res = await app.request('/api/v1/auth/session')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.user).toBeNull()
  })

  it('POST /api/v1/auth/logout returns ok even without session', async () => {
    const res = await app.request('/api/v1/auth/logout', {
      method: 'POST',
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
  })

  it('POST /api/v1/auth/logout without cookie still clears session cookie in response', async () => {
    // Logout without a session cookie should still return ok and set a clearing cookie header
    const res = await app.request('/api/v1/auth/logout', {
      method: 'POST',
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)

    // Check that the set-cookie header is present to clear the session cookie
    const setCookieHeader = res.headers.get('set-cookie')
    expect(setCookieHeader).toBeTruthy()
    expect(setCookieHeader).toContain('wm_session=')
  })

  it('POST /api/v1/auth/login rejects empty body', async () => {
    const res = await app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(400)
  })

  it('POST /api/v1/auth/login validates email format (no DB needed)', async () => {
    const res = await app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'invalid-email',
        password: 'password123',
      }),
    })
    // Validation happens before DB lookup, so this works without DB
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })

  it('POST /api/v1/auth/login validates password is not empty (no DB needed)', async () => {
    const res = await app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'user@example.com',
        password: '',
      }),
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })
})
