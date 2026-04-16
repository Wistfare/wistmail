import { Hono } from 'hono'
import { eq, and } from 'drizzle-orm'
import { NotFoundError, ValidationError } from '@wistmail/shared'
import { domains } from '@wistmail/db'
import { dualAuth, requireScope, type DualAuthEnv } from '../middleware/dual-auth.js'
import { createDomainSchema } from '../lib/validation.js'
import { DomainService } from '../services/domain.js'
import { getDb } from '../lib/db.js'

export const domainRoutes = new Hono<DualAuthEnv>()

domainRoutes.use('*', dualAuth)

function formatDomain(d: typeof domains.$inferSelect, serverIp?: string) {
  const selector = d.dkimSelector || 'wistmail'
  const records = [
    { type: 'MX' as const, name: d.name, value: `mail.${d.name}`, priority: 10, verified: d.mxVerified },
    { type: 'TXT' as const, name: d.name, value: `v=spf1 a mx${serverIp ? ` ip4:${serverIp}` : ''} ~all`, verified: d.spfVerified },
    { type: 'TXT' as const, name: `${selector}._domainkey.${d.name}`, value: d.dkimPublicKey || '', verified: d.dkimVerified },
    { type: 'TXT' as const, name: `_dmarc.${d.name}`, value: `v=DMARC1; p=quarantine; rua=mailto:dmarc@${d.name}`, verified: d.dmarcVerified },
  ]
  return {
    id: d.id,
    name: d.name,
    status: d.status,
    verified: d.verified,
    records,
    createdAt: d.createdAt,
  }
}

/**
 * POST /api/v1/domains — Add a new domain.
 */
domainRoutes.post('/', requireScope('domains:manage'), async (c) => {
  const body = await c.req.json()
  const parsed = createDomainSchema.safeParse(body)
  if (!parsed.success) {
    throw new ValidationError('Invalid request body', { errors: parsed.error.flatten().fieldErrors })
  }

  const db = getDb()
  const service = new DomainService(db)
  const userId = c.get('userId')

  const result = await service.create(userId, parsed.data.name)
  const row = await db.select().from(domains).where(eq(domains.id, result.id)).limit(1)
  return c.json(formatDomain(row[0], result.serverIp), 201)
})

/**
 * GET /api/v1/domains — List domains owned by the current user.
 */
domainRoutes.get('/', requireScope('domains:manage'), async (c) => {
  const db = getDb()
  const userId = c.get('userId')
  const rows = await db.select().from(domains).where(eq(domains.userId, userId))
  return c.json({
    data: rows.map((d) => formatDomain(d)),
    total: rows.length,
    page: 1,
    pageSize: rows.length,
    hasMore: false,
  })
})

/**
 * GET /api/v1/domains/:id — Get a domain with DNS records.
 */
domainRoutes.get('/:id', requireScope('domains:manage'), async (c) => {
  const id = c.req.param('id')
  const db = getDb()
  const userId = c.get('userId')
  const rows = await db
    .select()
    .from(domains)
    .where(and(eq(domains.id, id), eq(domains.userId, userId)))
    .limit(1)

  if (rows.length === 0) throw new NotFoundError('Domain', id)
  return c.json(formatDomain(rows[0]))
})

/**
 * POST /api/v1/domains/:id/verify — Verify DNS records.
 */
domainRoutes.post('/:id/verify', requireScope('domains:manage'), async (c) => {
  const id = c.req.param('id')
  const db = getDb()
  const userId = c.get('userId')
  const service = new DomainService(db)

  const rows = await db.select().from(domains).where(and(eq(domains.id, id), eq(domains.userId, userId))).limit(1)
  if (rows.length === 0) throw new NotFoundError('Domain', id)

  const result = await service.verifyById(id)
  return c.json(result)
})

/**
 * DELETE /api/v1/domains/:id — Remove a domain.
 */
domainRoutes.delete('/:id', requireScope('domains:manage'), async (c) => {
  const id = c.req.param('id')
  const db = getDb()
  const userId = c.get('userId')

  const rows = await db.select().from(domains).where(and(eq(domains.id, id), eq(domains.userId, userId))).limit(1)
  if (rows.length === 0) throw new NotFoundError('Domain', id)

  await db.delete(domains).where(eq(domains.id, id))
  return c.json({ ok: true })
})
