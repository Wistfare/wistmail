import { Hono } from 'hono'
import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { ValidationError } from '@wistmail/shared'
import { emails, mailboxes } from '@wistmail/db'
import { sessionAuth, type SessionEnv } from '../middleware/session-auth.js'
import { EmailService } from '../services/email.js'
import { EmailSender, EMAIL_STATUS } from '../services/email-sender.js'
import { checkAndReserveSend, refundSend } from '../services/send-rate-limit.js'
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
    const userId = c.get('userId')

    // Per-user send rate limit. If we're over budget the draft still
    // gets persisted in 'rate_limited' state — the dispatcher loop
    // will retry it automatically when the window rolls over, and the
    // UI can render it in the Outbox with a "Sending later…" pill.
    const rate = await checkAndReserveSend(userId)

    const result = await emailService.createDraft(userId, {
      ...parsed.data,
      mailboxId: parsed.data.mailboxId,
    })

    if (!rate.allowed) {
      // Stamp the email as rate_limited; user sees it in Outbox.
      await db
        .update(emails)
        .set({
          status: EMAIL_STATUS.RateLimited,
          sendError: `Send limit reached (${rate.scope})`,
          updatedAt: new Date(),
        })
        .where(eq(emails.id, result.id))
      return c.json(
        {
          id: result.id,
          status: EMAIL_STATUS.RateLimited,
          rate: {
            scope: rate.scope,
            retryAfterMs: rate.retryAfterMs,
            hourCount: rate.hourCount,
            dayCount: rate.dayCount,
          },
        },
        202,
      )
    }

    const sender = new EmailSender(db)
    // Claim atomically (idle → sending) and kick off the actual send
    // in the background. The HTTP response returns immediately so the
    // client can show "Sending…" without waiting on mail-engine.
    const claimed = await sender.claim(result.id)
    if (claimed) {
      sender.sendEmail(result.id).catch(async (err) => {
        console.error(`[compose] background send threw for ${result.id}:`, err)
        await refundSend(userId)
      })
    }

    return c.json({ id: result.id, status: EMAIL_STATUS.Sending }, 201)
  }

  const result = await emailService.createDraft(c.get('userId'), parsed.data)
  return c.json({ id: result.id, status: 'draft' }, 201)
})

/**
 * POST /api/v1/inbox/emails/:id/dispatch
 *
 * User-initiated retry for an email currently in 'failed' or
 * 'rate_limited'. The dispatcher loop covers automatic retries; this
 * endpoint covers the "Tap to retry" affordance after a hard failure
 * or the user wanting to send-now from the Outbox.
 */
inboxRoutes.post('/emails/:id/dispatch', async (c) => {
  const emailId = c.req.param('id')
  const userId = c.get('userId')
  const db = getDb()

  // Authorization — only the owner of the email's mailbox can dispatch.
  const owned = await db
    .select({ id: emails.id, status: emails.status })
    .from(emails)
    .innerJoin(mailboxes, eq(emails.mailboxId, mailboxes.id))
    .where(and(eq(emails.id, emailId), eq(mailboxes.userId, userId)))
    .limit(1)
  if (owned.length === 0) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Email not found' } }, 404)
  }

  const rate = await checkAndReserveSend(userId)
  if (!rate.allowed) {
    return c.json(
      {
        error: {
          code: 'RATE_LIMITED',
          message: `Send limit reached for the ${rate.scope}.`,
          details: {
            scope: rate.scope,
            retryAfterMs: rate.retryAfterMs,
          },
        },
      },
      429,
    )
  }

  const sender = new EmailSender(db)
  const claimed = await sender.claim(emailId)
  if (!claimed) {
    return c.json(
      {
        error: {
          code: 'INVALID_STATE',
          message: 'Email is already sending or has been sent.',
        },
      },
      409,
    )
  }

  sender.sendEmail(emailId).catch(async (err) => {
    console.error(`[dispatch] background send threw for ${emailId}:`, err)
    await refundSend(userId)
  })

  return c.json({ id: emailId, status: EMAIL_STATUS.Sending }, 202)
})
