import { Hono } from 'hono'
import { z } from 'zod'
import { ValidationError } from '@wistmail/shared'
import { sessionAuth, type SessionEnv } from '../middleware/session-auth.js'
import { EmailService } from '../services/email.js'
import { EmailSender } from '../services/email-sender.js'
import { getDb } from '../lib/db.js'

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
  const db = getDb()
  const emailService = new EmailService(db)
  await emailService.markRead(emailId, c.get('userId'))
  return c.json({ ok: true })
})

/**
 * POST /api/v1/inbox/emails/:id/unread
 */
inboxRoutes.post('/emails/:id/unread', async (c) => {
  const emailId = c.req.param('id')
  const db = getDb()
  const emailService = new EmailService(db)
  await emailService.markUnread(emailId, c.get('userId'))
  return c.json({ ok: true })
})

/**
 * POST /api/v1/inbox/emails/:id/star
 */
inboxRoutes.post('/emails/:id/star', async (c) => {
  const emailId = c.req.param('id')
  const db = getDb()
  const emailService = new EmailService(db)
  const starred = await emailService.toggleStar(emailId, c.get('userId'))
  return c.json({ starred })
})

/**
 * POST /api/v1/inbox/emails/:id/archive
 */
inboxRoutes.post('/emails/:id/archive', async (c) => {
  const emailId = c.req.param('id')
  const db = getDb()
  const emailService = new EmailService(db)
  await emailService.archive(emailId, c.get('userId'))
  return c.json({ ok: true })
})

/**
 * POST /api/v1/inbox/emails/:id/delete
 */
inboxRoutes.post('/emails/:id/delete', async (c) => {
  const emailId = c.req.param('id')
  const db = getDb()
  const emailService = new EmailService(db)
  await emailService.delete(emailId, c.get('userId'))
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
 * GET /api/v1/inbox/search?q=query
 */
inboxRoutes.get('/search', async (c) => {
  const query = c.req.query('q') || ''
  if (!query.trim()) {
    return c.json({ data: [], total: 0, page: 1, pageSize: 25, hasMore: false })
  }

  const db = getDb()
  const emailService = new EmailService(db)
  const result = await emailService.search(c.get('userId'), query)
  return c.json(result)
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
    send: z.boolean().default(false),
  })

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    throw new ValidationError('Invalid email', { errors: parsed.error.flatten().fieldErrors })
  }

  const db = getDb()
  const emailService = new EmailService(db)

  if (parsed.data.send) {
    // Create email as draft first
    const result = await emailService.createDraft(c.get('userId'), {
      ...parsed.data,
      mailboxId: parsed.data.mailboxId,
    })

    // Send via SMTP in the background
    const sender = new EmailSender(db)
    sender.sendEmail(result.id).catch((err) => {
      console.error(`Failed to send email ${result.id}:`, err)
    })

    return c.json({ id: result.id, status: 'sending' }, 201)
  }

  const result = await emailService.createDraft(c.get('userId'), parsed.data)
  return c.json({ id: result.id, status: 'draft' }, 201)
})
