import { Hono } from 'hono'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { ValidationError } from '@wistmail/shared'
import { users } from '@wistmail/db'
import { sessionAuth, type SessionEnv } from '../middleware/session-auth.js'
import { DomainService } from '../services/domain.js'
import { MailboxService } from '../services/mailbox.js'
import { AuditService } from '../services/audit.js'
import { getDb } from '../lib/db.js'

const addDomainSchema = z.object({
  name: z.string().min(3).max(253),
})

const createMailboxSchema = z.object({
  address: z.string().min(1),
  displayName: z.string().min(1).max(255),
  domainId: z.string().min(1),
})

export const setupRoutes = new Hono<SessionEnv>()

setupRoutes.use('*', sessionAuth)

/**
 * POST /api/v1/setup/domain
 * Add a domain during setup wizard.
 */
setupRoutes.post('/domain', async (c) => {
  const body = await c.req.json()
  const parsed = addDomainSchema.safeParse(body)
  if (!parsed.success) {
    throw new ValidationError('Invalid domain', { errors: parsed.error.flatten().fieldErrors })
  }

  const db = getDb()
  const domainService = new DomainService(db)
  const result = await domainService.create(c.get('userId'), parsed.data.name)

  const audit = new AuditService(db)
  await audit.log({
    userId: c.get('userId'),
    action: 'domain.created',
    resource: 'domain',
    resourceId: result.id,
    details: { name: result.name },
  })

  return c.json(result, 201)
})

/**
 * POST /api/v1/setup/domain/:id/verify
 * Verify DNS records for a domain.
 */
setupRoutes.post('/domain/:id/verify', async (c) => {
  const domainId = c.req.param('id')
  const db = getDb()
  const domainService = new DomainService(db)
  const result = await domainService.verify(domainId, c.get('userId'))

  const audit = new AuditService(db)
  await audit.log({
    userId: c.get('userId'),
    action: 'domain.verified',
    resource: 'domain',
    resourceId: domainId,
    details: result,
  })

  return c.json(result)
})

/**
 * GET /api/v1/setup/domain/:id
 * Get domain details with DNS records.
 */
setupRoutes.get('/domain/:id', async (c) => {
  const domainId = c.req.param('id')
  const db = getDb()
  const domainService = new DomainService(db)
  const result = await domainService.getById(domainId, c.get('userId'))
  return c.json(result)
})

/**
 * GET /api/v1/setup/domains
 * List user's domains.
 */
setupRoutes.get('/domains', async (c) => {
  const db = getDb()
  const domainService = new DomainService(db)
  const result = await domainService.list(c.get('userId'))
  return c.json({ data: result })
})

/**
 * POST /api/v1/setup/mailbox
 * Create a mailbox during setup wizard.
 */
setupRoutes.post('/mailbox', async (c) => {
  const body = await c.req.json()
  const parsed = createMailboxSchema.safeParse(body)
  if (!parsed.success) {
    throw new ValidationError('Invalid mailbox', { errors: parsed.error.flatten().fieldErrors })
  }

  const db = getDb()
  const mailboxService = new MailboxService(db)
  const result = await mailboxService.create(c.get('userId'), parsed.data)

  const audit = new AuditService(db)
  await audit.log({
    userId: c.get('userId'),
    action: 'mailbox.created',
    resource: 'mailbox',
    resourceId: result.id,
    details: { address: result.address },
  })

  return c.json(result, 201)
})

/**
 * GET /api/v1/setup/mailboxes
 * List user's mailboxes.
 */
setupRoutes.get('/mailboxes', async (c) => {
  const db = getDb()
  const mailboxService = new MailboxService(db)
  const result = await mailboxService.list(c.get('userId'))
  return c.json({ data: result })
})

const stepSchema = z.object({
  step: z.enum(['domain', 'dns', 'mailbox', 'done']),
})

/**
 * PATCH /api/v1/setup/step
 * Update the user's current setup step (for resume on re-visit).
 */
setupRoutes.patch('/step', async (c) => {
  const body = await c.req.json()
  const parsed = stepSchema.safeParse(body)
  if (!parsed.success) {
    throw new ValidationError('Invalid step')
  }

  const db = getDb()
  await db.update(users).set({ setupStep: parsed.data.step }).where(eq(users.id, c.get('userId')))

  return c.json({ step: parsed.data.step })
})

/**
 * POST /api/v1/setup/complete
 * Mark setup as complete — user can now access the app.
 */
setupRoutes.post('/complete', async (c) => {
  const db = getDb()
  await db
    .update(users)
    .set({ setupComplete: true, setupStep: 'done' })
    .where(eq(users.id, c.get('userId')))

  return c.json({ setupComplete: true })
})
