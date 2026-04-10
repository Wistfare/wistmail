import { Hono } from 'hono'
import { z } from 'zod'
import { ValidationError } from '@wistmail/shared'
import { EmailReceiver } from '../services/email-receiver.js'
import { getDb } from '../lib/db.js'

export const inboundRoutes = new Hono()

const inboundSchema = z.object({
  from: z.string(),
  to: z.array(z.string()),
  rawData: z.string(),
})

/**
 * POST /api/v1/inbox/inbound
 * Called by the Go mail engine when an email is received via SMTP.
 * No user auth — internal service-to-service call.
 */
inboundRoutes.post('/inbound', async (c) => {
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
