import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { app } from '../app.js'
import { hashApiKey } from './auth.js'

describe('API Key Auth Middleware', () => {
  const validKey = 'wm_test_key_1234567890abcdef'
  const authHeaders = { 'X-API-Key': validKey }

  it('rejects requests without X-API-Key header', async () => {
    const res = await app.request('/api/v1/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'a@example.com',
        to: 'b@example.com',
        subject: 'Test',
      }),
    })
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error.code).toBe('UNAUTHORIZED')
    expect(body.error.message).toContain('Missing X-API-Key')
  })

  it('rejects API keys that do not start with wm_', async () => {
    const res = await app.request('/api/v1/emails', {
      method: 'POST',
      headers: {
        'X-API-Key': 'sk_invalid_key_format',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'a@example.com',
        to: 'b@example.com',
        subject: 'Test',
      }),
    })
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error.code).toBe('UNAUTHORIZED')
    expect(body.error.message).toContain('Invalid API key format')
  })

  it('accepts valid API key and allows request through', async () => {
    const res = await app.request('/api/v1/emails', {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'sender@example.com',
        to: 'recipient@example.com',
        subject: 'Test Email',
        text: 'Hello',
      }),
    })
    expect(res.status).toBe(201)
  })

  it('accepts any key starting with wm_', async () => {
    const res = await app.request('/api/v1/domains', {
      headers: { 'X-API-Key': 'wm_anything_goes_here_12345' },
    })
    expect(res.status).not.toBe(401)
  })
})

describe('hashApiKey', () => {
  it('returns a SHA-256 hex string', () => {
    const hash = hashApiKey('wm_test_key')
    expect(hash).toHaveLength(64)
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
  })

  it('returns consistent output for the same input', () => {
    const hash1 = hashApiKey('wm_my_secret_key')
    const hash2 = hashApiKey('wm_my_secret_key')
    expect(hash1).toBe(hash2)
  })

  it('returns different output for different inputs', () => {
    const hash1 = hashApiKey('wm_key_one')
    const hash2 = hashApiKey('wm_key_two')
    expect(hash1).not.toBe(hash2)
  })

  it('matches Node.js crypto SHA-256 output', () => {
    const key = 'wm_test_verify_hash'
    const expected = createHash('sha256').update(key).digest('hex')
    expect(hashApiKey(key)).toBe(expected)
  })
})

describe('requireScope', () => {
  const authHeaders = { 'X-API-Key': 'wm_test_key_1234567890abcdef' }

  it('allows requests when scope is present', async () => {
    const res = await app.request('/api/v1/emails', {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'sender@example.com',
        to: 'recipient@example.com',
        subject: 'Test',
        text: 'Body',
      }),
    })
    expect(res.status).toBe(201)
  })
})
