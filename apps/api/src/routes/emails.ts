import { Hono } from 'hono'
import { generateId, ValidationError, NotFoundError } from '@wistmail/shared'
import { apiKeyAuth, requireScope } from '../middleware/auth.js'
import { rateLimit } from '../middleware/rate-limit.js'
import { sendEmailSchema, batchSendSchema } from '../lib/validation.js'
import type { AppEnv } from '../app.js'

export const emailRoutes = new Hono<AppEnv>()

// All email routes require auth
emailRoutes.use('*', apiKeyAuth)

/**
 * POST /api/v1/emails
 * Send a single email.
 */
emailRoutes.post('/', requireScope('emails:send'), rateLimit(10), async (c) => {
  const body = await c.req.json()
  const parsed = sendEmailSchema.safeParse(body)

  if (!parsed.success) {
    throw new ValidationError('Invalid request body', {
      errors: parsed.error.flatten().fieldErrors,
    })
  }

  // TODO: Use input when queue worker is implemented
  void parsed.data
  const emailId = generateId('eml')

  // Check idempotency
  const idempotencyKey = c.req.header('Idempotency-Key')
  if (idempotencyKey) {
    // TODO: Check Redis for existing idempotency key
    // If found, return the cached response
  }

  // TODO: Normalize recipients when queue worker is implemented
  // const to = toArray(input.to)
  // const cc = input.cc ? toArray(input.cc) : []
  // const bcc = input.bcc ? toArray(input.bcc) : []

  // TODO: Validate from address matches a verified domain

  // TODO: If templateId is set, render template with variables

  // TODO: Queue the email for sending via BullMQ
  // The queue worker will:
  // 1. Build the MIME message
  // 2. Sign with DKIM
  // 3. Send via SMTP client
  // 4. Update sending log
  // 5. Trigger webhooks

  // TODO: Store sending log in database
  // const sendingLog = {
  //   id: generateId('slog'),
  //   emailId,
  //   status: input.scheduledAt ? 'scheduled' : 'queued',
  //   from: input.from,
  //   to,
  //   cc,
  //   bcc,
  //   subject: input.subject || '',
  //   createdAt: new Date().toISOString(),
  // }

  return c.json({ id: emailId }, 201)
})

/**
 * POST /api/v1/emails/batch
 * Send multiple emails in a single request.
 */
emailRoutes.post('/batch', requireScope('emails:send'), rateLimit(5), async (c) => {
  const body = await c.req.json()
  const parsed = batchSendSchema.safeParse(body)

  if (!parsed.success) {
    throw new ValidationError('Invalid request body', {
      errors: parsed.error.flatten().fieldErrors,
    })
  }

  const ids: string[] = []
  for (const _email of parsed.data.emails) {
    const emailId = generateId('eml')
    ids.push(emailId)
    // TODO: Queue each email for sending
  }

  return c.json({ ids }, 201)
})

/**
 * GET /api/v1/emails/:id
 * Get email status and details.
 */
emailRoutes.get('/:id', requireScope('emails:read'), async (c) => {
  const id = c.req.param('id')

  // TODO: Look up email in database
  // For now, return a mock response
  throw new NotFoundError('Email', id)
})

/**
 * PATCH /api/v1/emails/:id/cancel
 * Cancel a scheduled email.
 */
emailRoutes.patch('/:id/cancel', requireScope('emails:send'), async (c) => {
  const id = c.req.param('id')

  // TODO: Check if email is scheduled and cancel it
  throw new NotFoundError('Email', id)
})
