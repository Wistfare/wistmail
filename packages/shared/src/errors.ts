// ─── Error Codes ────────────────────────────────────────────────────────────

export const ErrorCode = {
  // Auth
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  INVALID_API_KEY: 'INVALID_API_KEY',
  API_KEY_EXPIRED: 'API_KEY_EXPIRED',
  INSUFFICIENT_SCOPE: 'INSUFFICIENT_SCOPE',
  MFA_REQUIRED: 'MFA_REQUIRED',

  // Validation
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_EMAIL_ADDRESS: 'INVALID_EMAIL_ADDRESS',
  INVALID_DOMAIN: 'INVALID_DOMAIN',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',

  // Resources
  NOT_FOUND: 'NOT_FOUND',
  ALREADY_EXISTS: 'ALREADY_EXISTS',
  DOMAIN_NOT_VERIFIED: 'DOMAIN_NOT_VERIFIED',
  MAILBOX_FULL: 'MAILBOX_FULL',

  // Rate limiting
  RATE_LIMITED: 'RATE_LIMITED',
  DAILY_LIMIT_REACHED: 'DAILY_LIMIT_REACHED',

  // Email sending
  SEND_FAILED: 'SEND_FAILED',
  BOUNCE: 'BOUNCE',
  REJECTED: 'REJECTED',
  SPAM_DETECTED: 'SPAM_DETECTED',
  ATTACHMENT_TOO_LARGE: 'ATTACHMENT_TOO_LARGE',
  TOO_MANY_RECIPIENTS: 'TOO_MANY_RECIPIENTS',
  MESSAGE_TOO_LARGE: 'MESSAGE_TOO_LARGE',

  // DNS
  DNS_VERIFICATION_FAILED: 'DNS_VERIFICATION_FAILED',
  DNS_RECORD_MISSING: 'DNS_RECORD_MISSING',

  // Server
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',

  // Idempotency
  IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT',
} as const

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode]

// ─── Error Classes ──────────────────────────────────────────────────────────

export class WistMailError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly statusCode: number = 500,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'WistMailError'
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details && { details: this.details }),
      },
    }
  }
}

export class ValidationError extends WistMailError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(ErrorCode.VALIDATION_ERROR, message, 400, details)
    this.name = 'ValidationError'
  }
}

export class AuthenticationError extends WistMailError {
  constructor(message: string = 'Invalid or missing API key') {
    super(ErrorCode.UNAUTHORIZED, message, 401)
    this.name = 'AuthenticationError'
  }
}

export class AuthorizationError extends WistMailError {
  constructor(message: string = 'Insufficient permissions') {
    super(ErrorCode.INSUFFICIENT_SCOPE, message, 403)
    this.name = 'AuthorizationError'
  }
}

export class NotFoundError extends WistMailError {
  constructor(resource: string, id?: string) {
    const message = id ? `${resource} with id '${id}' not found` : `${resource} not found`
    super(ErrorCode.NOT_FOUND, message, 404)
    this.name = 'NotFoundError'
  }
}

export class RateLimitError extends WistMailError {
  constructor(retryAfterSeconds: number) {
    super(ErrorCode.RATE_LIMITED, `Rate limit exceeded. Retry after ${retryAfterSeconds} seconds.`, 429, {
      retryAfter: retryAfterSeconds,
    })
    this.name = 'RateLimitError'
  }
}

export class ConflictError extends WistMailError {
  constructor(message: string) {
    super(ErrorCode.ALREADY_EXISTS, message, 409)
    this.name = 'ConflictError'
  }
}
