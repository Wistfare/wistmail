import { Hono } from 'hono'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { ValidationError } from '@wistmail/shared'
import { users } from '@wistmail/db'
import { sessionAuth, type SessionEnv } from '../middleware/session-auth.js'
import { ChatService } from '../services/chat.js'
import { getDb } from '../lib/db.js'
import { eventBus } from '../events/bus.js'
import { sendChatNotification } from '../services/fcm.js'

export const chatRoutes = new Hono<SessionEnv>()

chatRoutes.use('*', sessionAuth)

/** GET /api/v1/chat/conversations */
chatRoutes.get('/conversations', async (c) => {
  const db = getDb()
  const service = new ChatService(db)
  const summaries = await service.listForUser(c.get('userId'))
  return c.json({ conversations: summaries })
})

/**
 * POST /api/v1/chat/conversations
 * Body: { userEmail: string } — finds-or-creates a direct conversation.
 */
chatRoutes.post('/conversations', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const schema = z.object({ userEmail: z.string().email() })
  const parsed = schema.safeParse(body)
  if (!parsed.success) throw new ValidationError('Invalid userEmail')

  const db = getDb()
  const other = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(eq(users.email, parsed.data.userEmail.toLowerCase()))
    .limit(1)

  if (other.length === 0) {
    return c.json(
      { error: { code: 'NOT_FOUND', message: 'User not found' } },
      404,
    )
  }

  const service = new ChatService(db)
  const id = await service.createDirect(c.get('userId'), other[0].id)
  return c.json({ id }, 201)
})

/** GET /api/v1/chat/conversations/:id/messages */
chatRoutes.get('/conversations/:id/messages', async (c) => {
  const id = c.req.param('id')
  const db = getDb()
  const service = new ChatService(db)
  try {
    const messages = await service.listMessages(id, c.get('userId'))
    return c.json({ messages })
  } catch (err) {
    if ((err as Error).message === 'Not a participant in this conversation') {
      return c.json(
        { error: { code: 'FORBIDDEN', message: 'Not a participant' } },
        403,
      )
    }
    throw err
  }
})

/** POST /api/v1/chat/conversations/:id/read */
chatRoutes.post('/conversations/:id/read', async (c) => {
  const id = c.req.param('id')
  const db = getDb()
  const service = new ChatService(db)
  await service.markRead(id, c.get('userId'))
  return c.json({ ok: true })
})

/**
 * POST /api/v1/chat/conversations/:id/messages
 * Body: { content: string }
 */
chatRoutes.post('/conversations/:id/messages', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json().catch(() => ({}))
  const schema = z.object({ content: z.string().min(1).max(4000) })
  const parsed = schema.safeParse(body)
  if (!parsed.success) throw new ValidationError('Invalid content')

  const db = getDb()
  const service = new ChatService(db)
  const senderId = c.get('userId')
  const senderName = c.get('user').name

  try {
    const { id: messageId, createdAt } = await service.sendMessage({
      conversationId: id,
      senderId,
      content: parsed.data.content,
    })

    // Fan out WS events + push notifications to other participants.
    const otherParticipants = await service.listOtherParticipants(id, senderId)
    for (const p of otherParticipants) {
      eventBus.publish({
        type: 'chat.message.new',
        userId: p.userId,
        conversationId: id,
        messageId,
        senderId,
        content: parsed.data.content,
        createdAt: createdAt.toISOString(),
      })
      sendChatNotification({
        userId: p.userId,
        conversationId: id,
        senderName,
        content: parsed.data.content,
      }).catch((err) => console.error('[chat] FCM push failed:', err))
    }

    return c.json({ id: messageId, createdAt: createdAt.toISOString() }, 201)
  } catch (err) {
    if ((err as Error).message === 'Not a participant in this conversation') {
      return c.json(
        { error: { code: 'FORBIDDEN', message: 'Not a participant' } },
        403,
      )
    }
    throw err
  }
})
