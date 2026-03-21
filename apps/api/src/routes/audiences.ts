import { Hono } from 'hono'
import { generateId, NotFoundError, ValidationError } from '@wistmail/shared'
import { apiKeyAuth, requireScope } from '../middleware/auth.js'
import { createAudienceSchema, createContactSchema, updateContactSchema } from '../lib/validation.js'
import type { AppEnv } from '../app.js'

export const audienceRoutes = new Hono<AppEnv>()

audienceRoutes.use('*', apiKeyAuth)

/**
 * POST /api/v1/audiences
 * Create an audience.
 */
audienceRoutes.post('/', requireScope('contacts:manage'), async (c) => {
  const body = await c.req.json()
  const parsed = createAudienceSchema.safeParse(body)

  if (!parsed.success) {
    throw new ValidationError('Invalid request body', {
      errors: parsed.error.flatten().fieldErrors,
    })
  }

  const audienceId = generateId('aud')

  return c.json(
    {
      id: audienceId,
      name: parsed.data.name,
      contactCount: 0,
      createdAt: new Date().toISOString(),
    },
    201,
  )
})

/**
 * GET /api/v1/audiences
 * List audiences.
 */
audienceRoutes.get('/', requireScope('contacts:manage'), async (c) => {
  return c.json({ data: [], total: 0, page: 1, pageSize: 25, hasMore: false })
})

/**
 * POST /api/v1/audiences/:id/contacts
 * Add a contact to an audience.
 */
audienceRoutes.post('/:id/contacts', requireScope('contacts:manage'), async (c) => {
  const audienceId = c.req.param('id')
  const body = await c.req.json()
  const parsed = createContactSchema.safeParse(body)

  if (!parsed.success) {
    throw new ValidationError('Invalid request body', {
      errors: parsed.error.flatten().fieldErrors,
    })
  }

  const contactId = generateId('con')

  return c.json(
    {
      id: contactId,
      audienceId,
      ...parsed.data,
      createdAt: new Date().toISOString(),
    },
    201,
  )
})

/**
 * GET /api/v1/audiences/:id/contacts
 * List contacts in an audience.
 */
audienceRoutes.get('/:id/contacts', requireScope('contacts:manage'), async (c) => {
  return c.json({ data: [], total: 0, page: 1, pageSize: 25, hasMore: false })
})

/**
 * PATCH /api/v1/contacts/:id
 * Update a contact.
 */
audienceRoutes.patch('/contacts/:id', requireScope('contacts:manage'), async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  const parsed = updateContactSchema.safeParse(body)

  if (!parsed.success) {
    throw new ValidationError('Invalid request body', {
      errors: parsed.error.flatten().fieldErrors,
    })
  }

  throw new NotFoundError('Contact', id)
})

/**
 * DELETE /api/v1/contacts/:id
 * Delete a contact.
 */
audienceRoutes.delete('/contacts/:id', requireScope('contacts:manage'), async (c) => {
  const id = c.req.param('id')
  throw new NotFoundError('Contact', id)
})
