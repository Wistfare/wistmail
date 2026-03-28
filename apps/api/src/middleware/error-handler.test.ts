import { describe, expect, it } from 'vitest'
import { Hono } from 'hono'
import {
  WistMailError,
  ValidationError,
  AuthenticationError,
  NotFoundError,
  RateLimitError,
} from '@wistmail/shared'
import { errorHandler } from './error-handler.js'

/**
 * Creates a test app with the error handler and a route that throws the given error.
 */
function createAppThrowing(error: Error) {
  const testApp = new Hono()
  testApp.onError(errorHandler)
  testApp.get('/test', () => {
    throw error
  })
  return testApp
}

describe('Error Handler Middleware', () => {
  it('handles WistMailError and returns proper JSON with correct status code', async () => {
    const error = new WistMailError('VALIDATION_ERROR', 'Something went wrong', 422, {
      field: 'email',
    })
    const testApp = createAppThrowing(error)

    const res = await testApp.request('/test')
    expect(res.status).toBe(422)

    const body = await res.json()
    expect(body.error.code).toBe('VALIDATION_ERROR')
    expect(body.error.message).toBe('Something went wrong')
    expect(body.error.details).toEqual({ field: 'email' })
  })

  it('handles ValidationError with status 400', async () => {
    const error = new ValidationError('Invalid input', { errors: { name: ['required'] } })
    const testApp = createAppThrowing(error)

    const res = await testApp.request('/test')
    expect(res.status).toBe(400)

    const body = await res.json()
    expect(body.error.code).toBe('VALIDATION_ERROR')
    expect(body.error.message).toBe('Invalid input')
    expect(body.error.details.errors).toEqual({ name: ['required'] })
  })

  it('handles AuthenticationError with status 401', async () => {
    const error = new AuthenticationError('Bad credentials')
    const testApp = createAppThrowing(error)

    const res = await testApp.request('/test')
    expect(res.status).toBe(401)

    const body = await res.json()
    expect(body.error.code).toBe('UNAUTHORIZED')
    expect(body.error.message).toBe('Bad credentials')
  })

  it('handles NotFoundError with status 404', async () => {
    const error = new NotFoundError('Domain', 'dom_123')
    const testApp = createAppThrowing(error)

    const res = await testApp.request('/test')
    expect(res.status).toBe(404)

    const body = await res.json()
    expect(body.error.code).toBe('NOT_FOUND')
    expect(body.error.message).toContain('dom_123')
  })

  it('handles RateLimitError with status 429', async () => {
    const error = new RateLimitError(30)
    const testApp = createAppThrowing(error)

    const res = await testApp.request('/test')
    expect(res.status).toBe(429)

    const body = await res.json()
    expect(body.error.code).toBe('RATE_LIMITED')
    expect(body.error.details).toEqual({ retryAfter: 30 })
  })

  it('handles unknown Error with status 500 and generic message', async () => {
    const error = new Error('Something unexpected happened')
    const testApp = createAppThrowing(error)

    const res = await testApp.request('/test')
    expect(res.status).toBe(500)

    const body = await res.json()
    expect(body.error.code).toBe('INTERNAL_ERROR')
    expect(body.error.message).toBe('An internal error occurred')
    // Should NOT leak the original error message
    expect(JSON.stringify(body)).not.toContain('Something unexpected happened')
  })

  it('handles TypeError as an unknown error with status 500', async () => {
    const error = new TypeError('Cannot read properties of undefined')
    const testApp = createAppThrowing(error)

    const res = await testApp.request('/test')
    expect(res.status).toBe(500)

    const body = await res.json()
    expect(body.error.code).toBe('INTERNAL_ERROR')
    expect(body.error.message).toBe('An internal error occurred')
  })

  it('returns JSON content type for all errors', async () => {
    const error = new ValidationError('Bad data')
    const testApp = createAppThrowing(error)

    const res = await testApp.request('/test')
    const contentType = res.headers.get('content-type')
    expect(contentType).toContain('application/json')
  })

  it('does not include details property when WistMailError has no details', async () => {
    const error = new AuthenticationError('Missing token')
    const testApp = createAppThrowing(error)

    const res = await testApp.request('/test')
    const body = await res.json()

    expect(body.error.code).toBe('UNAUTHORIZED')
    expect(body.error).not.toHaveProperty('details')
  })
})
