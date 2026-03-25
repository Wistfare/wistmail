import { Hono } from 'hono'
import { generateId, NotFoundError, ValidationError } from '@wistmail/shared'
import { apiKeyAuth, requireScope } from '../middleware/auth.js'
import { createDomainSchema } from '../lib/validation.js'
import type { AppEnv } from '../app.js'

export const domainRoutes = new Hono<AppEnv>()

domainRoutes.use('*', apiKeyAuth)

/**
 * POST /api/v1/domains
 * Add a new domain.
 */
domainRoutes.post('/', requireScope('domains:manage'), async (c) => {
  const body = await c.req.json()
  const parsed = createDomainSchema.safeParse(body)

  if (!parsed.success) {
    throw new ValidationError('Invalid request body', {
      errors: parsed.error.flatten().fieldErrors,
    })
  }

  const { name } = parsed.data
  const domainId = generateId('dom')

  // TODO: Check if domain already exists in DB
  // TODO: Generate DKIM key pair
  // TODO: Store domain in database

  // Generate required DNS records for the user to configure
  const records = [
    {
      type: 'MX' as const,
      name: name,
      value: `mail.${name}`,
      priority: 10,
      verified: false,
    },
    {
      type: 'TXT' as const,
      name: name,
      value: `v=spf1 include:${name} -all`,
      verified: false,
    },
    {
      type: 'TXT' as const,
      name: `wistmail._domainkey.${name}`,
      value: 'v=DKIM1; k=rsa; p=GENERATED_PUBLIC_KEY',
      verified: false,
    },
    {
      type: 'TXT' as const,
      name: `_dmarc.${name}`,
      value: `v=DMARC1; p=none; rua=mailto:dmarc@${name}`,
      verified: false,
    },
  ]

  return c.json(
    {
      id: domainId,
      name,
      status: 'pending',
      records,
      createdAt: new Date().toISOString(),
    },
    201,
  )
})

/**
 * GET /api/v1/domains
 * List all domains.
 */
domainRoutes.get('/', requireScope('domains:manage'), async (c) => {
  // TODO: Fetch from database
  return c.json({ data: [], total: 0, page: 1, pageSize: 25, hasMore: false })
})

/**
 * GET /api/v1/domains/:id
 * Get domain details with DNS records.
 */
domainRoutes.get('/:id', requireScope('domains:manage'), async (c) => {
  const id = c.req.param('id')
  // TODO: Fetch from database
  throw new NotFoundError('Domain', id)
})

/**
 * POST /api/v1/domains/:id/verify
 * Trigger DNS verification for a domain.
 */
domainRoutes.post('/:id/verify', requireScope('domains:manage'), async (c) => {
  const id = c.req.param('id')

  // TODO: Look up domain
  // TODO: Check DNS records (MX, SPF, DKIM, DMARC)
  // TODO: Update verification status

  throw new NotFoundError('Domain', id)
})

/**
 * DELETE /api/v1/domains/:id
 * Remove a domain.
 */
domainRoutes.delete('/:id', requireScope('domains:manage'), async (c) => {
  const id = c.req.param('id')
  // TODO: Delete from database
  throw new NotFoundError('Domain', id)
})
