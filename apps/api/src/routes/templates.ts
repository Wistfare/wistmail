import { Hono } from 'hono'
import { generateId, NotFoundError, ValidationError } from '@wistmail/shared'
import { apiKeyAuth, requireScope } from '../middleware/auth.js'
import { createTemplateSchema, updateTemplateSchema } from '../lib/validation.js'
import type { AppEnv } from '../app.js'

export const templateRoutes = new Hono<AppEnv>()

templateRoutes.use('*', apiKeyAuth)

/**
 * POST /api/v1/templates
 * Create an email template.
 */
templateRoutes.post('/', requireScope('templates:manage'), async (c) => {
  const body = await c.req.json()
  const parsed = createTemplateSchema.safeParse(body)

  if (!parsed.success) {
    throw new ValidationError('Invalid request body', {
      errors: parsed.error.flatten().fieldErrors,
    })
  }

  const templateId = generateId('tpl')

  // TODO: Store in database

  return c.json(
    {
      id: templateId,
      ...parsed.data,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    201,
  )
})

/**
 * GET /api/v1/templates
 * List templates.
 */
templateRoutes.get('/', requireScope('templates:manage'), async (c) => {
  return c.json({ data: [], total: 0, page: 1, pageSize: 25, hasMore: false })
})

/**
 * GET /api/v1/templates/:id
 * Get a template.
 */
templateRoutes.get('/:id', requireScope('templates:manage'), async (c) => {
  const id = c.req.param('id')
  throw new NotFoundError('Template', id)
})

/**
 * PATCH /api/v1/templates/:id
 * Update a template.
 */
templateRoutes.patch('/:id', requireScope('templates:manage'), async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  const parsed = updateTemplateSchema.safeParse(body)

  if (!parsed.success) {
    throw new ValidationError('Invalid request body', {
      errors: parsed.error.flatten().fieldErrors,
    })
  }

  throw new NotFoundError('Template', id)
})

/**
 * DELETE /api/v1/templates/:id
 * Delete a template.
 */
templateRoutes.delete('/:id', requireScope('templates:manage'), async (c) => {
  const id = c.req.param('id')
  throw new NotFoundError('Template', id)
})
