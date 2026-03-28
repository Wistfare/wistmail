export class WistMailError extends Error {
  readonly code: string
  readonly statusCode: number
  readonly details?: Record<string, unknown>

  constructor(message: string, code: string, statusCode: number, details?: Record<string, unknown>) {
    super(message)
    this.name = 'WistMailError'
    this.code = code
    this.statusCode = statusCode
    this.details = details
  }
}

export class AuthenticationError extends WistMailError {
  constructor(message = 'Invalid API key') {
    super(message, 'UNAUTHORIZED', 401)
  }
}

export class RateLimitError extends WistMailError {
  readonly retryAfter: number

  constructor(retryAfter: number) {
    super(`Rate limit exceeded. Retry after ${retryAfter} seconds`, 'RATE_LIMITED', 429)
    this.retryAfter = retryAfter
  }
}

export class ValidationError extends WistMailError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', 400, details)
  }
}

export class NotFoundError extends WistMailError {
  constructor(resource: string) {
    super(`${resource} not found`, 'NOT_FOUND', 404)
  }
}
