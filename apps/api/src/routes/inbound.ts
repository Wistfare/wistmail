import { Hono } from 'hono'
import { z } from 'zod'
import { ValidationError } from '@wistmail/shared'
import { EmailReceiver } from '../services/email-receiver.js'
import { getDb } from '../lib/db.js'

export const inboundRoutes = new Hono()

const INBOUND_SECRET = process.env.INBOUND_SECRET

const inboundSchema = z.object({
  from: z.string(),
  to: z.array(z.string()),
  rawData: z.string(),
})

/**
 * POST /api/v1/inbox/inbound
 * Called by the Go mail engine when an email is received via SMTP.
 * Authenticated via shared secret — not user session auth.
 */
inboundRoutes.post('/inbound', async (c) => {
  // Validate shared secret from mail engine
  const authHeader = c.req.header('X-Inbound-Secret')
  if (!INBOUND_SECRET || authHeader !== INBOUND_SECRET) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const body = await c.req.json()
  const parsed = inboundSchema.safeParse(body)

  if (!parsed.success) {
    throw new ValidationError('Invalid inbound email data')
  }

  const db = getDb()
  const receiver = new EmailReceiver(db)
  const result = await receiver.processInbound(parsed.data)

  if (result.stored) {
    return c.json({ stored: true, emailId: result.emailId }, 201)
  }

  return c.json({ stored: false, error: result.error }, 200)
})
