import { Hono } from 'hono'
import { generateId, generateApiKey, NotFoundError, ValidationError } from '@wistmail/shared'
import { apiKeyAuth } from '../middleware/auth.js'
import { createApiKeySchema } from '../lib/validation.js'
import type { AppEnv } from '../app.js'

export const apiKeyRoutes = new Hono<AppEnv>()

apiKeyRoutes.use('*', apiKeyAuth)

/**
 * POST /api/v1/api-keys
 * Create a new API key.
 */
apiKeyRoutes.post('/', async (c) => {
  const body = await c.req.json()
  const parsed = createApiKeySchema.safeParse(body)

  if (!parsed.success) {
    throw new ValidationError('Invalid request body', {
      errors: parsed.error.flatten().fieldErrors,
    })
  }

  const { name, scopes, domainId, expiresAt } = parsed.data
  const { key, prefix } = generateApiKey()
  const keyId = generateId('key')
  // TODO: Store in database — will need keyHash:
  // const keyHash = hashApiKey(key)
  // The full key is only returned once — never stored in plain text

  return c.json(
    {
      id: keyId,
      key, // Only returned on creation
      name,
      keyPrefix: prefix,
      scopes,
      domainId: domainId || null,
      expiresAt: expiresAt || null,
      createdAt: new Date().toISOString(),
    },
    201,
  )
})

/**
 * GET /api/v1/api-keys
 * List API keys (without the full key).
 */
apiKeyRoutes.get('/', async (c) => {
  // TODO: Fetch from database
  return c.json({ data: [], total: 0, page: 1, pageSize: 25, hasMore: false })
})

/**
 * DELETE /api/v1/api-keys/:id
 * Revoke an API key.
 */
apiKeyRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id')
  // TODO: Delete from database
  throw new NotFoundError('API Key', id)
})
