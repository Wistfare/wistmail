import { Hono } from 'hono'
import { eq, and } from 'drizzle-orm'
import { generateId, generateApiKey, ValidationError } from '@wistmail/shared'
import { apiKeys } from '@wistmail/db'
import { hashApiKey } from '../middleware/auth.js'
import { sessionAuth, type SessionEnv } from '../middleware/session-auth.js'
import { getDb } from '../lib/db.js'

export const apiKeyRoutes = new Hono<SessionEnv>()

// API key management is done via session auth (settings UI)
apiKeyRoutes.use('*', sessionAuth)

/**
 * POST /api/v1/api-keys
 * Create a new API key. Returns the full key ONCE.
 */
apiKeyRoutes.post('/', async (c) => {
  const body = await c.req.json()
  const name = body.name?.trim()
  const scopes = body.scopes || ['emails:send', 'emails:read']

  if (!name || name.length < 1) {
    throw new ValidationError('Name is required')
  }

  const { key, prefix } = generateApiKey()
  const keyId = generateId('key')
  const keyHash = hashApiKey(key)
  const userId = c.get('userId')
  const now = new Date()

  const db = getDb()
  await db.insert(apiKeys).values({
    id: keyId,
    keyHash,
    keyPrefix: prefix,
    name,
    scopes,
    userId,
    createdAt: now,
  })

  return c.json({
    id: keyId,
    key, // Full key — only returned on creation, never stored
    name,
    keyPrefix: prefix,
    scopes,
    createdAt: now.toISOString(),
  }, 201)
})

/**
 * GET /api/v1/api-keys
 * List API keys (prefix only, never the full key).
 */
apiKeyRoutes.get('/', async (c) => {
  const db = getDb()
  const userId = c.get('userId')

  const keys = await db
    .select({
      id: apiKeys.id,
      keyPrefix: apiKeys.keyPrefix,
      name: apiKeys.name,
      scopes: apiKeys.scopes,
      lastUsedAt: apiKeys.lastUsedAt,
      expiresAt: apiKeys.expiresAt,
      createdAt: apiKeys.createdAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.userId, userId))

  return c.json({ data: keys })
})

/**
 * DELETE /api/v1/api-keys/:id
 * Revoke an API key.
 */
apiKeyRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const userId = c.get('userId')
  const db = getDb()

  await db
    .delete(apiKeys)
    .where(and(eq(apiKeys.id, id), eq(apiKeys.userId, userId)))

  return c.json({ ok: true })
})
