import { Hono } from 'hono'
import { generateId, generateWebhookSecret, NotFoundError, ValidationError } from '@wistmail/shared'
import { apiKeyAuth, requireScope } from '../middleware/auth.js'
import { createWebhookSchema, updateWebhookSchema } from '../lib/validation.js'
import type { AppEnv } from '../app.js'

export const webhookRoutes = new Hono<AppEnv>()

webhookRoutes.use('*', apiKeyAuth)

/**
 * POST /api/v1/webhooks
 * Create a webhook endpoint.
 */
webhookRoutes.post('/', requireScope('webhooks:manage'), async (c) => {
  const body = await c.req.json()
  const parsed = createWebhookSchema.safeParse(body)

  if (!parsed.success) {
    throw new ValidationError('Invalid request body', {
      errors: parsed.error.flatten().fieldErrors,
    })
  }

  const { url, events, domainId } = parsed.data
  const webhookId = generateId('whk')
  const secret = generateWebhookSecret()

  // TODO: Store in database

  return c.json(
    {
      id: webhookId,
      url,
      events,
      secret,
      domainId: domainId || null,
      active: true,
      createdAt: new Date().toISOString(),
    },
    201,
  )
})

/**
 * GET /api/v1/webhooks
 * List webhooks.
 */
webhookRoutes.get('/', requireScope('webhooks:manage'), async (c) => {
  return c.json({ data: [], total: 0, page: 1, pageSize: 25, hasMore: false })
})

/**
 * GET /api/v1/webhooks/:id
 * Get webhook details with recent logs.
 */
webhookRoutes.get('/:id', requireScope('webhooks:manage'), async (c) => {
  const id = c.req.param('id')
  throw new NotFoundError('Webhook', id)
})

/**
 * PATCH /api/v1/webhooks/:id
 * Update a webhook.
 */
webhookRoutes.patch('/:id', requireScope('webhooks:manage'), async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  const parsed = updateWebhookSchema.safeParse(body)

  if (!parsed.success) {
    throw new ValidationError('Invalid request body', {
      errors: parsed.error.flatten().fieldErrors,
    })
  }

  // TODO: Update in database
  throw new NotFoundError('Webhook', id)
})

/**
 * DELETE /api/v1/webhooks/:id
 * Delete a webhook.
 */
webhookRoutes.delete('/:id', requireScope('webhooks:manage'), async (c) => {
  const id = c.req.param('id')
  throw new NotFoundError('Webhook', id)
})
