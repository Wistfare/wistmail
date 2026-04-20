import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { generateId, ValidationError, NotFoundError } from '@wistmail/shared'
import { sendingLogs, domains } from '@wistmail/db'
import { apiKeyAuth, requireScope } from '../middleware/auth.js'
import { rateLimit } from '../middleware/rate-limit.js'
import { sendEmailSchema, batchSendSchema } from '../lib/validation.js'
import { WebhookDispatcher } from '../services/webhook-dispatcher.js'
import { getDb } from '../lib/db.js'
import type { AppEnv } from '../app.js'

const MAIL_ENGINE_URL = process.env.MAIL_ENGINE_URL || 'http://mail-engine:8025'
const INBOUND_SECRET = process.env.INBOUND_SECRET || ''

export const emailRoutes = new Hono<AppEnv>()

emailRoutes.use('*', apiKeyAuth)

/**
 * POST /api/v1/emails
 * Send a single email via the transactional API.
 */
emailRoutes.post('/', requireScope('emails:send'), rateLimit(10), async (c) => {
  const body = await c.req.json()
  const parsed = sendEmailSchema.safeParse(body)

  if (!parsed.success) {
    throw new ValidationError('Invalid request body', {
      errors: parsed.error.flatten().fieldErrors,
    })
  }

  const input = parsed.data
  const db = getDb()
  const emailId = generateId('eml')

  // Validate from address domain is verified. `from` may be either a bare
  // address ("a@b.com") or RFC 5322 display form ("Name <a@b.com>").
  const fromAddrMatch = input.from.match(/<([^>]+)>/)
  const fromAddress = (fromAddrMatch ? fromAddrMatch[1] : input.from).trim()
  const fromDomain = fromAddress.split('@')[1]?.toLowerCase()
  if (!fromDomain) {
    throw new ValidationError(`Invalid 'from' address: '${input.from}'`)
  }
  const domainResult = await db.select().from(domains).where(eq(domains.name, fromDomain)).limit(1)
  if (domainResult.length === 0 || !domainResult[0].verified) {
    throw new ValidationError(`Domain '${fromDomain}' is not verified. Add and verify it in settings.`)
  }

  // Normalize recipients
  const to = Array.isArray(input.to) ? input.to : [input.to]
  const cc = input.cc ? (Array.isArray(input.cc) ? input.cc : [input.cc]) : []
  const bcc = input.bcc ? (Array.isArray(input.bcc) ? input.bcc : [input.bcc]) : []

  // Note: sending_logs has FK to emails table. For API sends, we track
  // status in the response and fire webhooks directly.

  // Send via mail engine
  let sendStatus: 'sent' | 'failed' = 'failed'
  let sendError: string | undefined

  try {
    const response = await fetch(`${MAIL_ENGINE_URL}/api/v1/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Inbound-Secret': INBOUND_SECRET,
      },
      body: JSON.stringify({
        from: input.from,
        to,
        cc: cc.length > 0 ? cc : undefined,
        bcc: bcc.length > 0 ? bcc : undefined,
        subject: input.subject || '',
        html: input.html,
        text: input.text,
        replyTo: input.replyTo,
        headers: input.headers,
      }),
    })

    const data = await response.json() as { status?: string; error?: string }

    if (response.ok) {
      sendStatus = 'sent'
    } else {
      sendError = data.error || `Mail engine error: ${response.status}`
    }
  } catch (err) {
    sendError = err instanceof Error ? err.message : String(err)
  }

  // Fire webhook
  const dispatcher = new WebhookDispatcher(db)
  dispatcher.dispatch(sendStatus === 'sent' ? 'email.sent' : 'email.failed', {
    emailId,
    from: input.from,
    to,
    subject: input.subject || '',
    status: sendStatus,
    error: sendError,
  }).catch((err) => console.error('Webhook dispatch error:', err))

  if (sendError) {
    return c.json({ id: emailId, status: 'failed', error: sendError }, 500)
  }

  return c.json({ id: emailId, status: 'sent' }, 201)
})

/**
 * POST /api/v1/emails/batch
 * Send multiple emails.
 */
emailRoutes.post('/batch', requireScope('emails:send'), rateLimit(5), async (c) => {
  const body = await c.req.json()
  const parsed = batchSendSchema.safeParse(body)

  if (!parsed.success) {
    throw new ValidationError('Invalid request body', {
      errors: parsed.error.flatten().fieldErrors,
    })
  }

  const results: Array<{ id: string; status: string }> = []

  for (const email of parsed.data.emails) {
    const emailId = generateId('eml')
    const to = Array.isArray(email.to) ? email.to : [email.to]

    try {
      const response = await fetch(`${MAIL_ENGINE_URL}/api/v1/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Inbound-Secret': INBOUND_SECRET,
        },
        body: JSON.stringify({
          from: email.from,
          to,
          subject: email.subject || '',
          html: email.html,
          text: email.text,
        }),
      })

      results.push({ id: emailId, status: response.ok ? 'sent' : 'failed' })
    } catch {
      results.push({ id: emailId, status: 'failed' })
    }
  }

  // Return both shapes so existing SDK integrations (which read
  // `data`) and the test suite (which reads `ids`) both see their
  // expected payload. `ids` is always ordered identically to the
  // input emails array.
  return c.json(
    {
      data: results,
      ids: results.map((r) => r.id),
    },
    201,
  )
})

/**
 * GET /api/v1/emails/:id
 * Get email sending status.
 */
emailRoutes.get('/:id', requireScope('emails:read'), async (c) => {
  const id = c.req.param('id')
  const db = getDb()

  const result = await db
    .select()
    .from(sendingLogs)
    .where(eq(sendingLogs.emailId, id))
    .limit(1)

  if (result.length === 0) throw new NotFoundError('Email', id)

  const log = result[0]
  return c.json({
    id: log.emailId,
    status: log.status,
    createdAt: log.createdAt,
    deliveredAt: log.deliveredAt,
    openedAt: log.openedAt,
    bouncedAt: log.bouncedAt,
  })
})
