import { describe, expect, it } from 'vitest'
import {
  WistMailError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  RateLimitError,
  ConflictError,
  ErrorCode,
} from './errors.js'

describe('WistMailError', () => {
  it('creates error with correct properties', () => {
    const error = new WistMailError(ErrorCode.INTERNAL_ERROR, 'Something went wrong', 500)
    expect(error.code).toBe('INTERNAL_ERROR')
    expect(error.message).toBe('Something went wrong')
    expect(error.statusCode).toBe(500)
    expect(error.name).toBe('WistMailError')
  })

  it('serializes to JSON correctly', () => {
    const error = new WistMailError(ErrorCode.INTERNAL_ERROR, 'fail', 500, { foo: 'bar' })
    const json = error.toJSON()
    expect(json).toEqual({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'fail',
        details: { foo: 'bar' },
      },
    })
  })

  it('omits details when not provided', () => {
    const error = new WistMailError(ErrorCode.INTERNAL_ERROR, 'fail', 500)
    const json = error.toJSON()
    expect(json.error).not.toHaveProperty('details')
  })
})

describe('ValidationError', () => {
  it('has correct status code', () => {
    const error = new ValidationError('Invalid input')
    expect(error.statusCode).toBe(400)
    expect(error.code).toBe('VALIDATION_ERROR')
  })
})

describe('AuthenticationError', () => {
  it('has correct status code and default message', () => {
    const error = new AuthenticationError()
    expect(error.statusCode).toBe(401)
    expect(error.message).toBe('Invalid or missing API key')
  })
})

describe('AuthorizationError', () => {
  it('has correct status code', () => {
    const error = new AuthorizationError()
    expect(error.statusCode).toBe(403)
    expect(error.code).toBe('INSUFFICIENT_SCOPE')
  })
})

describe('NotFoundError', () => {
  it('formats message with resource name', () => {
    const error = new NotFoundError('Email')
    expect(error.message).toBe('Email not found')
    expect(error.statusCode).toBe(404)
  })

  it('formats message with resource name and id', () => {
    const error = new NotFoundError('Email', 'abc123')
    expect(error.message).toBe("Email with id 'abc123' not found")
  })
})

describe('RateLimitError', () => {
  it('has correct status code and retry info', () => {
    const error = new RateLimitError(30)
    expect(error.statusCode).toBe(429)
    expect(error.details).toEqual({ retryAfter: 30 })
  })
})

describe('ConflictError', () => {
  it('has correct status code', () => {
    const error = new ConflictError('Domain already exists')
    expect(error.statusCode).toBe(409)
  })
})
