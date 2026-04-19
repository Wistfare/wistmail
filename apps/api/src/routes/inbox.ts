import { Hono } from 'hono'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { ValidationError } from '@wistmail/shared'
import { mailboxes } from '@wistmail/db'
import { sessionAuth, type SessionEnv } from '../middleware/session-auth.js'
import { EmailService } from '../services/email.js'
import { EmailSender } from '../services/email-sender.js'
import { BillingService } from '../services/billing.js'
import { getDb } from '../lib/db.js'
import { eventBus } from '../events/bus.js'
import {
  searchEmails,
  searchEnabled,
  updateIndexedEmail,
  deleteIndexedEmail,
} from '../services/search.js'

export const inboxRoutes = new Hono<SessionEnv>()

inboxRoutes.use('*', sessionAuth)

/**
 * GET /api/v1/inbox/emails?folder=inbox&page=1&pageSize=25
 */
inboxRoutes.get('/emails', async (c) => {
  const folder = c.req.query('folder') || 'inbox'
  const page = parseInt(c.req.query('page') || '1', 10)
  const pageSize = parseInt(c.req.query('pageSize') || '25', 10)

  const db = getDb()
  const emailService = new EmailService(db)
  const result = await emailService.listByFolder(c.get('userId'), folder, page, pageSize)

  return c.json(result)
})

/**
 * GET /api/v1/inbox/emails/:id
 */
inboxRoutes.get('/emails/:id', async (c) => {
  const emailId = c.req.param('id')
  const db = getDb()
  const emailService = new EmailService(db)
  const email = await emailService.getById(emailId, c.get('userId'))

  if (!email) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Email not found' } }, 404)
  }

  return c.json(email)
})

/**
 * POST /api/v1/inbox/emails/:id/read
 */
inboxRoutes.post('/emails/:id/read', async (c) => {
  const emailId = c.req.param('id')
  const userId = c.get('userId')
  const db = getDb()
  const emailService = new EmailService(db)
  await emailService.markRead(emailId, userId)
  updateIndexedEmail(userId, emailId, { isRead: true }).catch(() => {})
  eventBus.publish({
    type: 'email.updated',
    userId,
    emailId,
    changes: { isRead: true },
  })
  return c.json({ ok: true })
})

/**
 * POST /api/v1/inbox/emails/:id/unread
 */
inboxRoutes.post('/emails/:id/unread', async (c) => {
  const emailId = c.req.param('id')
  const userId = c.get('userId')
  const db = getDb()
  const emailService = new EmailService(db)
  await emailService.markUnread(emailId, userId)
  updateIndexedEmail(userId, emailId, { isRead: false }).catch(() => {})
  eventBus.publish({
    type: 'email.updated',
    userId,
    emailId,
    changes: { isRead: false },
  })
  return c.json({ ok: true })
})

/**
 * POST /api/v1/inbox/emails/:id/star
 */
inboxRoutes.post('/emails/:id/star', async (c) => {
  const emailId = c.req.param('id')
  const userId = c.get('userId')
  const db = getDb()
  const emailService = new EmailService(db)
  const starred = await emailService.toggleStar(emailId, userId)
  updateIndexedEmail(userId, emailId, { isStarred: starred ?? false }).catch(() => {})
  eventBus.publish({
    type: 'email.updated',
    userId,
    emailId,
    changes: { isStarred: starred ?? false },
  })
  return c.json({ starred })
})

/**
 * POST /api/v1/inbox/emails/:id/archive
 */
inboxRoutes.post('/emails/:id/archive', async (c) => {
  const emailId = c.req.param('id')
  const userId = c.get('userId')
  const db = getDb()
  const emailService = new EmailService(db)
  await emailService.archive(emailId, userId)
  updateIndexedEmail(userId, emailId, { folder: 'archive' }).catch(() => {})
  eventBus.publish({
    type: 'email.updated',
    userId,
    emailId,
    changes: { folder: 'archive' },
  })
  return c.json({ ok: true })
})

/**
 * POST /api/v1/inbox/emails/:id/delete
 */
inboxRoutes.post('/emails/:id/delete', async (c) => {
  const emailId = c.req.param('id')
  const userId = c.get('userId')
  const db = getDb()
  const emailService = new EmailService(db)
  await emailService.delete(emailId, userId)
  // Move to trash + drop from search index. We don't search trash by default.
  deleteIndexedEmail(userId, emailId).catch(() => {})
  eventBus.publish({
    type: 'email.deleted',
    userId,
    emailId,
  })
  return c.json({ ok: true })
})

/**
 * POST /api/v1/inbox/emails/:id/move
 */
inboxRoutes.post('/emails/:id/move', async (c) => {
  const body = await c.req.json()
  const schema = z.object({ folder: z.string() })
  const parsed = schema.safeParse(body)
  if (!parsed.success) throw new ValidationError('Invalid folder')

  const emailId = c.req.param('id')
  const db = getDb()
  const emailService = new EmailService(db)
  await emailService.moveToFolder(emailId, c.get('userId'), parsed.data.folder)
  return c.json({ ok: true })
})

/**
 * GET /api/v1/inbox/unread-counts
 */
inboxRoutes.get('/unread-counts', async (c) => {
  const db = getDb()
  const emailService = new EmailService(db)
  const counts = await emailService.getUnreadCounts(c.get('userId'))
  return c.json(counts)
})

/**
 * GET /api/v1/inbox/search?q=query&page=1&pageSize=25
 *
 * Routes through MeiliSearch when enabled (covers full-text body match);
 * falls back to a slim SQL ILIKE on subject + from when MeiliSearch is
 * unreachable so the app never appears broken on a cold deploy.
 */
inboxRoutes.get('/search', async (c) => {
  const query = c.req.query('q') || ''
  const page = parseInt(c.req.query('page') || '1', 10)
  const pageSize = Math.min(parseInt(c.req.query('pageSize') || '25', 10), 100)
  if (!query.trim()) {
    return c.json({ data: [], total: 0, page, pageSize, hasMore: false })
  }

  if (searchEnabled()) {
    const meili = await searchEmails(c.get('userId'), query, page, pageSize)
    if (meili) return c.json(meili)
  }

  const db = getDb()
  const emailService = new EmailService(db)
  const fallback = await emailService.search(c.get('userId'), query, page, pageSize)
  return c.json(fallback)
})

/**
 * POST /api/v1/inbox/compose
 * Save a draft or send an email
 */
inboxRoutes.post('/compose', async (c) => {
  const body = await c.req.json()
  const schema = z.object({
    fromAddress: z.string(),
    toAddresses: z.array(z.string().email()),
    cc: z.array(z.string().email()).optional(),
    bcc: z.array(z.string().email()).optional(),
    subject: z.string(),
    textBody: z.string().optional(),
    htmlBody: z.string().optional(),
    mailboxId: z.string(),
    inReplyTo: z.string().optional(),
    scheduledAt: z.string().optional(),
    send: z.boolean().default(false),
  })

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    throw new ValidationError('Invalid email', { errors: parsed.error.flatten().fieldErrors })
  }

  const db = getDb()
  const emailService = new EmailService(db)

  // Validate fromAddress belongs to the user's mailbox
  const userMailboxes = await db
    .select()
    .from(mailboxes)
    .where(eq(mailboxes.userId, c.get('userId')))
  const validAddresses = userMailboxes.map((m) => m.address.toLowerCase())
  if (!validAddresses.includes(parsed.data.fromAddress.toLowerCase())) {
    throw new ValidationError('You can only send from your own email addresses')
  }
  // Validate mailboxId belongs to the user
  if (!userMailboxes.some((m) => m.id === parsed.data.mailboxId)) {
    throw new ValidationError('Invalid mailbox')
  }

  if (parsed.data.send) {
    const orgId = c.get('orgId')

    // Atomic deduct-or-fail: avoids the TOCTOU window where a precheck
    // says "yes" but a concurrent send drains the balance before we
    // actually charge. If there are no credits we never even queue.
    if (orgId) {
      const billing = new BillingService(db)
      const deducted = await billing.deductCredit(orgId, 'pre-send')
      if (!deducted) {
        throw new ValidationError(
          'Insufficient email credits. Please purchase more credits to continue sending.',
        )
      }
    }

    // Create email as draft first
    const result = await emailService.createDraft(c.get('userId'), {
      ...parsed.data,
      mailboxId: parsed.data.mailboxId,
    })

    // Send via mail engine in the background. Refund the credit if the
    // send fails so users aren't charged for messages we couldn't deliver.
    const sender = new EmailSender(db)
    sender
      .sendEmail(result.id)
      .then(async (sendResult) => {
        if (!sendResult.success && orgId) {
          await new BillingService(db).addCredits(
            orgId,
            1,
            `Refund for failed send ${result.id}`,
          )
        }
      })
      .catch(async (err) => {
        console.error(`Failed to send email ${result.id}:`, err)
        if (orgId) {
          await new BillingService(db).addCredits(
            orgId,
            1,
            `Refund for failed send ${result.id}`,
          )
        }
      })

    return c.json({ id: result.id, status: 'sending' }, 201)
  }

  const result = await emailService.createDraft(c.get('userId'), parsed.data)
  return c.json({ id: result.id, status: 'draft' }, 201)
})
