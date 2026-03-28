import { describe, expect, it, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import { rateLimit } from './rate-limit.js'
import { errorHandler } from './error-handler.js'
import { apiKeyAuth } from './auth.js'
import type { AppEnv } from '../app.js'

/**
 * Creates a small test app with auth + rate limiting + error handler for isolated testing.
 * Using a standalone app avoids interference from other tests' rate limit state.
 * The error handler is required because rateLimit throws RateLimitError.
 */
function createRateLimitedApp(maxRequests: number, windowMs: number = 1000) {
  const testApp = new Hono<AppEnv>()
  testApp.onError(errorHandler)
  testApp.use('*', apiKeyAuth)
  testApp.get('/test', rateLimit(maxRequests, windowMs), (c) => {
    return c.json({ ok: true })
  })
  return testApp
}

const authHeaders = { 'X-API-Key': 'wm_ratelimit_test_key_unique' }

describe('Rate Limit Middleware', () => {
  it('allows requests under the limit and sets rate limit headers', async () => {
    const testApp = createRateLimitedApp(5)

    const res = await testApp.request('/test', { headers: authHeaders })
    expect(res.status).toBe(200)
    expect(res.headers.get('X-RateLimit-Limit')).toBe('5')
    expect(res.headers.get('X-RateLimit-Remaining')).toBe('4')
    expect(res.headers.get('X-RateLimit-Reset')).toBeTruthy()
  })

  it('decrements remaining count with each request', async () => {
    const testApp = createRateLimitedApp(5)
    const headers = { 'X-API-Key': 'wm_decrement_test_key_abc' }

    const res1 = await testApp.request('/test', { headers })
    expect(res1.headers.get('X-RateLimit-Remaining')).toBe('4')

    const res2 = await testApp.request('/test', { headers })
    expect(res2.headers.get('X-RateLimit-Remaining')).toBe('3')

    const res3 = await testApp.request('/test', { headers })
    expect(res3.headers.get('X-RateLimit-Remaining')).toBe('2')
  })

  it('returns 429 when limit is exceeded', async () => {
    const testApp = createRateLimitedApp(2)
    const headers = { 'X-API-Key': 'wm_exceed_test_key_xyz' }

    // First two requests should pass
    const res1 = await testApp.request('/test', { headers })
    expect(res1.status).toBe(200)

    const res2 = await testApp.request('/test', { headers })
    expect(res2.status).toBe(200)

    // Third request should be rate limited
    const res3 = await testApp.request('/test', { headers })
    expect(res3.status).toBe(429)
    const body = await res3.json()
    expect(body.error.code).toBe('RATE_LIMITED')
  })

  it('includes Retry-After header when rate limited', async () => {
    const testApp = createRateLimitedApp(1)
    const headers = { 'X-API-Key': 'wm_retry_after_test_key' }

    await testApp.request('/test', { headers })
    const res = await testApp.request('/test', { headers })

    expect(res.status).toBe(429)
    const retryAfter = res.headers.get('Retry-After')
    expect(retryAfter).toBeTruthy()
    expect(Number(retryAfter)).toBeGreaterThanOrEqual(0)
  })

  it('sets remaining to 0 when rate limited', async () => {
    const testApp = createRateLimitedApp(1)
    const headers = { 'X-API-Key': 'wm_remaining_zero_test' }

    await testApp.request('/test', { headers })
    const res = await testApp.request('/test', { headers })

    expect(res.status).toBe(429)
    expect(res.headers.get('X-RateLimit-Remaining')).toBe('0')
  })

  it('tracks different API keys independently', async () => {
    const testApp = createRateLimitedApp(1)
    const headersA = { 'X-API-Key': 'wm_independent_key_aaa' }
    const headersB = { 'X-API-Key': 'wm_independent_key_bbb' }

    // Key A: first request passes
    const resA1 = await testApp.request('/test', { headers: headersA })
    expect(resA1.status).toBe(200)

    // Key A: second request is limited
    const resA2 = await testApp.request('/test', { headers: headersA })
    expect(resA2.status).toBe(429)

    // Key B: first request should still pass (independent counter)
    const resB1 = await testApp.request('/test', { headers: headersB })
    expect(resB1.status).toBe(200)
  })

  it('resets after the time window passes', async () => {
    vi.useFakeTimers()
    try {
      const windowMs = 500
      const testApp = createRateLimitedApp(1, windowMs)
      const headers = { 'X-API-Key': 'wm_window_reset_test' }

      const res1 = await testApp.request('/test', { headers })
      expect(res1.status).toBe(200)

      // Should be rate limited
      const res2 = await testApp.request('/test', { headers })
      expect(res2.status).toBe(429)

      // Advance time past the window
      vi.advanceTimersByTime(windowMs + 100)

      // Should be allowed again
      const res3 = await testApp.request('/test', { headers })
      expect(res3.status).toBe(200)
    } finally {
      vi.useRealTimers()
    }
  })

  it('returns correct X-RateLimit-Limit value matching configured max', async () => {
    const testApp = createRateLimitedApp(42)
    const headers = { 'X-API-Key': 'wm_limit_value_test' }

    const res = await testApp.request('/test', { headers })
    expect(res.headers.get('X-RateLimit-Limit')).toBe('42')
    expect(res.headers.get('X-RateLimit-Remaining')).toBe('41')
  })
})
