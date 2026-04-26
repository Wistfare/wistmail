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
import {
  deleteIndexedChatMessage,
  indexChatMessage,
  searchChatMessages,
  updateIndexedChatMessage,
} from '../services/chat-search.js'
import { generateId } from '@wistmail/shared'
import {
  openAttachmentStream,
  putAttachment,
} from '../lib/attachment-storage.js'

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
  const userId = c.get('userId')
  try {
    await service.markRead(id, userId)
  } catch (err) {
    if ((err as Error).message === 'Not a participant in this conversation') {
      return c.json(
        { error: { code: 'FORBIDDEN', message: 'Not a participant' } },
        403,
      )
    }
    throw err
  }

  // Notify this user's other devices/tabs so the badge clears
  // everywhere. Only the marker's own unreadCount changed; we
  // don't fan out to others.
  const conv = await service.getConversation(id)
  if (conv) {
    eventBus.publish({
      type: 'chat.conversation.updated',
      userId,
      conversationId: id,
      lastMessageAt: conv.lastMessageAt.toISOString(),
      unreadCount: 0,
    })
  }

  // Tell every participant the seen-by set changed. Receivers
  // refetch reads when they want to render the new state — keeps
  // this event payload small no matter how many messages were
  // bulk-marked.
  const readAt = new Date().toISOString()
  const participants = await service.listParticipantsWithUnread(id)
  for (const p of participants) {
    eventBus.publish({
      type: 'chat.conversation.read',
      userId: p.userId,
      conversationId: id,
      readerId: userId,
      readAt,
    })
  }

  return c.json({ ok: true })
})

/** GET /api/v1/chat/conversations/:id/reads — full per-message read map. */
chatRoutes.get('/conversations/:id/reads', async (c) => {
  const id = c.req.param('id')
  const db = getDb()
  const service = new ChatService(db)
  try {
    const reads = await service.listConversationReads(id, c.get('userId'))
    return c.json({
      reads: reads.map((r) => ({
        messageId: r.messageId,
        userId: r.userId,
        readAt: r.readAt.toISOString(),
      })),
    })
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

/**
 * GET /api/v1/chat/conversations/:cid/messages/:mid/reads
 * Lists who has read a single message. Nested under the conversation
 * for symmetry with every other chat sub-resource — knowing only a
 * message id lets you derive its conversation, but URL-by-URL the
 * relationship should be self-evident.
 */
chatRoutes.get('/conversations/:cid/messages/:mid/reads', async (c) => {
  const conversationId = c.req.param('cid')
  const messageId = c.req.param('mid')
  const db = getDb()
  const service = new ChatService(db)
  try {
    const reads = await service.listMessageReads({
      conversationId,
      messageId,
      requesterId: c.get('userId'),
    })
    return c.json({
      reads: reads.map((r) => ({
        userId: r.userId,
        name: r.name,
        avatarUrl: r.avatarUrl,
        readAt: r.readAt.toISOString(),
      })),
    })
  } catch (err) {
    const msg = (err as Error).message
    if (msg === 'Not a participant in this conversation') {
      return c.json({ error: { code: 'FORBIDDEN', message: msg } }, 403)
    }
    if (msg === 'Message not found') {
      return c.json({ error: { code: 'NOT_FOUND', message: msg } }, 404)
    }
    throw err
  }
})

/**
 * PATCH /api/v1/chat/conversations/:cid/messages/:mid
 * Body: { content } — only the original sender can edit. The
 * conversation's lastMessageAt is intentionally not bumped. The
 * `:cid` segment must match the message's actual conversation; a
 * mismatch surfaces as 404 (we never confirm the existence of a
 * message in a chat the caller can't see).
 */
chatRoutes.patch('/conversations/:cid/messages/:mid', async (c) => {
  const conversationId = c.req.param('cid')
  const messageId = c.req.param('mid')
  const body = await c.req.json().catch(() => ({}))
  const schema = z.object({ content: z.string().min(1).max(4000) })
  const parsed = schema.safeParse(body)
  if (!parsed.success) throw new ValidationError('Invalid content')

  const db = getDb()
  const service = new ChatService(db)
  const userId = c.get('userId')

  let result
  try {
    result = await service.editMessage({
      conversationId,
      messageId,
      userId,
      content: parsed.data.content,
    })
  } catch (err) {
    const msg = (err as Error).message
    if (msg === 'Message not found') {
      return c.json({ error: { code: 'NOT_FOUND', message: msg } }, 404)
    }
    if (msg.startsWith('Only the sender')) {
      return c.json({ error: { code: 'FORBIDDEN', message: msg } }, 403)
    }
    if (msg.includes('deleted message') || msg.includes('content is required')) {
      return c.json({ error: { code: 'BAD_REQUEST', message: msg } }, 400)
    }
    throw err
  }

  const participants = await service.listParticipantsWithUnread(
    result.conversationId,
  )
  for (const p of participants) {
    eventBus.publish({
      type: 'chat.message.updated',
      userId: p.userId,
      conversationId: result.conversationId,
      messageId: result.id,
      content: result.content,
      editedAt: result.editedAt.toISOString(),
    })
  }

  void updateIndexedChatMessage(
    result.id,
    participants.map((p) => p.userId),
    { content: result.content },
  ).catch((err) => console.error('[chat] search update failed:', err))

  return c.json({
    id: result.id,
    content: result.content,
    editedAt: result.editedAt.toISOString(),
  })
})

/**
 * DELETE /api/v1/chat/conversations/:cid/messages/:mid
 * Soft-delete by the sender. The row is retained; subsequent reads
 * return an empty content body so deleted text can never be re-
 * rendered. URL `:cid` must match the message's actual conversation.
 */
chatRoutes.delete('/conversations/:cid/messages/:mid', async (c) => {
  const conversationId = c.req.param('cid')
  const messageId = c.req.param('mid')
  const db = getDb()
  const service = new ChatService(db)
  const userId = c.get('userId')

  let result
  try {
    result = await service.deleteMessage({
      conversationId,
      messageId,
      userId,
    })
  } catch (err) {
    const msg = (err as Error).message
    if (msg === 'Message not found') {
      return c.json({ error: { code: 'NOT_FOUND', message: msg } }, 404)
    }
    if (msg.startsWith('Only the sender')) {
      return c.json({ error: { code: 'FORBIDDEN', message: msg } }, 403)
    }
    throw err
  }

  const participants = await service.listParticipantsWithUnread(
    result.conversationId,
  )
  for (const p of participants) {
    eventBus.publish({
      type: 'chat.message.deleted',
      userId: p.userId,
      conversationId: result.conversationId,
      messageId: result.id,
      deletedAt: result.deletedAt.toISOString(),
    })
  }

  void deleteIndexedChatMessage(
    result.id,
    participants.map((p) => p.userId),
  ).catch((err) => console.error('[chat] search delete failed:', err))

  return c.json({
    id: result.id,
    deletedAt: result.deletedAt.toISOString(),
  })
})

/**
 * POST /api/v1/chat/conversations/group
 * Body: { title, participantIds[] } — creates a multi-participant
 * group. The creator is auto-added; duplicates are deduped server-side.
 */
chatRoutes.post('/conversations/group', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const schema = z.object({
    title: z.string().min(1).max(100),
    participantIds: z.array(z.string().min(1)).min(1).max(50),
  })
  const parsed = schema.safeParse(body)
  if (!parsed.success) throw new ValidationError('Invalid group payload')

  const db = getDb()
  const service = new ChatService(db)
  const userId = c.get('userId')

  let id: string
  try {
    id = await service.createGroup({
      creatorId: userId,
      title: parsed.data.title,
      participantIds: parsed.data.participantIds,
    })
  } catch (err) {
    const msg = (err as Error).message
    if (msg.includes('at least one') || msg.includes('title is required')) {
      return c.json({ error: { code: 'BAD_REQUEST', message: msg } }, 400)
    }
    throw err
  }

  // Notify every participant so the new group surfaces in their
  // conversation list immediately on every connected device.
  const conv = await service.getConversation(id)
  const participants = await service.listParticipantsWithUnread(id)
  const lastMessageAt = (conv?.lastMessageAt ?? new Date()).toISOString()
  for (const p of participants) {
    eventBus.publish({
      type: 'chat.conversation.updated',
      userId: p.userId,
      conversationId: id,
      lastMessageAt,
      unreadCount: p.unreadCount,
    })
  }

  return c.json({ id }, 201)
})

/** GET /api/v1/chat/conversations/:id/participants */
chatRoutes.get('/conversations/:id/participants', async (c) => {
  const id = c.req.param('id')
  const db = getDb()
  const service = new ChatService(db)
  try {
    const participants = await service.listParticipants(id, c.get('userId'))
    return c.json({ participants })
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

/**
 * POST /api/v1/chat/conversations/:id/participants
 * Body: { userIds: string[] } — adds members to a group. Caller must
 * be a current member. Returns the IDs that were actually added
 * (deduped against existing membership).
 */
chatRoutes.post('/conversations/:id/participants', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json().catch(() => ({}))
  const schema = z.object({
    userIds: z.array(z.string().min(1)).min(1).max(20),
  })
  const parsed = schema.safeParse(body)
  if (!parsed.success) throw new ValidationError('Invalid participants payload')

  const db = getDb()
  const service = new ChatService(db)
  const userId = c.get('userId')
  let added: string[] = []
  try {
    const result = await service.addParticipants(id, userId, parsed.data.userIds)
    added = result.added
  } catch (err) {
    const msg = (err as Error).message
    if (msg === 'Not a participant in this conversation') {
      return c.json({ error: { code: 'FORBIDDEN', message: msg } }, 403)
    }
    if (msg.includes('non-group')) {
      return c.json({ error: { code: 'BAD_REQUEST', message: msg } }, 400)
    }
    throw err
  }

  if (added.length > 0) {
    const conv = await service.getConversation(id)
    const participants = await service.listParticipantsWithUnread(id)
    const lastMessageAt = (conv?.lastMessageAt ?? new Date()).toISOString()
    for (const p of participants) {
      eventBus.publish({
        type: 'chat.conversation.updated',
        userId: p.userId,
        conversationId: id,
        lastMessageAt,
        unreadCount: p.unreadCount,
      })
    }
  }

  return c.json({ added })
})

/**
 * DELETE /api/v1/chat/conversations/:id/participants/:userId
 * Removes a member from a group. Self-leave always allowed; removing
 * others requires being the creator.
 */
chatRoutes.delete('/conversations/:id/participants/:userId', async (c) => {
  const id = c.req.param('id')
  const target = c.req.param('userId')
  const db = getDb()
  const service = new ChatService(db)
  const requester = c.get('userId')

  try {
    await service.removeParticipant(id, requester, target)
  } catch (err) {
    const msg = (err as Error).message
    if (
      msg === 'Not a participant in this conversation' ||
      msg.includes('Only the group creator')
    ) {
      return c.json({ error: { code: 'FORBIDDEN', message: msg } }, 403)
    }
    if (msg.includes('non-group')) {
      return c.json({ error: { code: 'BAD_REQUEST', message: msg } }, 400)
    }
    throw err
  }

  // Tell the removed user's other devices to drop the conversation.
  // Setting unreadCount=0 + a stale lastMessageAt is the simplest
  // "this is gone for you" signal until we add a dedicated event.
  eventBus.publish({
    type: 'chat.conversation.updated',
    userId: target,
    conversationId: id,
    lastMessageAt: new Date(0).toISOString(),
    unreadCount: 0,
  })

  return c.json({ ok: true })
})

/**
 * POST /api/v1/chat/conversations/:id/typing
 * Ephemeral typing ping. No body; the server fans out a `chat.typing`
 * event to every other participant. Clients debounce emission to once
 * per ~3 seconds while keystrokes are flowing.
 */
chatRoutes.post('/conversations/:id/typing', async (c) => {
  const id = c.req.param('id')
  const db = getDb()
  const service = new ChatService(db)
  const userId = c.get('userId')
  const user = c.get('user')

  // Confirm membership AND get the fan-out targets in one call.
  // listParticipants gates via requireParticipant; non-members hit
  // the catch and surface as 403 — same shape as every other
  // conversation-scoped action.
  let participants
  try {
    participants = await service.listParticipants(id, userId)
  } catch {
    return c.json(
      { error: { code: 'FORBIDDEN', message: 'Not a participant' } },
      403,
    )
  }

  const at = new Date().toISOString()
  for (const p of participants) {
    if (p.id === userId) continue // don't echo to the typer
    eventBus.publish({
      type: 'chat.typing',
      userId: p.id,
      conversationId: id,
      typerId: userId,
      typerName: user.name,
      at,
    })
  }
  return c.json({ ok: true })
})

/**
 * POST /api/v1/chat/attachments
 * multipart/form-data with a `file` field. Stages the bytes on disk
 * and returns `{ id, filename, contentType, sizeBytes }`. The send
 * call later claims the id via `attachmentIds`.
 *
 * Two-step intentionally: keeps the send call cheap (JSON only) and
 * lets the client show "uploading…" progress per-file before
 * committing the message. Orphan rows (uploaded but never claimed)
 * can be GC'd by a follow-up cron — out of scope for this phase.
 */
chatRoutes.post('/attachments', async (c) => {
  const form = await c.req.parseBody().catch(() => null)
  if (!form) {
    return c.json(
      { error: { code: 'BAD_REQUEST', message: 'Expected multipart/form-data' } },
      400,
    )
  }
  const file = form['file']
  if (!(file instanceof File)) {
    return c.json(
      { error: { code: 'BAD_REQUEST', message: 'Missing `file` field' } },
      400,
    )
  }

  // 25 MB cap matches the inbound mail limit. Keeps a single bad
  // upload from blowing out the disk.
  const MAX_BYTES = 25 * 1024 * 1024
  if (file.size > MAX_BYTES) {
    return c.json(
      {
        error: {
          code: 'PAYLOAD_TOO_LARGE',
          message: `Attachment exceeds ${Math.floor(MAX_BYTES / (1024 * 1024))}MB limit`,
        },
      },
      413,
    )
  }

  // Generate the id once and use it for BOTH the disk path and the
  // DB row. Keeps `openAttachmentStream(id)` self-contained on the
  // download side (no DB roundtrip to resolve the storage path).
  const id = generateId('cat')
  const bytes = Buffer.from(await file.arrayBuffer())
  const storageKey = await putAttachment(id, bytes)

  const db = getDb()
  const service = new ChatService(db)
  await service.stageAttachment({
    id,
    uploaderId: c.get('userId'),
    filename: file.name || 'untitled',
    contentType: file.type || 'application/octet-stream',
    sizeBytes: file.size,
    storageKey,
  })

  return c.json(
    {
      id,
      filename: file.name || 'untitled',
      contentType: file.type || 'application/octet-stream',
      sizeBytes: file.size,
    },
    201,
  )
})

/**
 * GET /api/v1/chat/conversations/:cid/attachments/:aid
 * Streams the attachment bytes. Caller must be a participant of the
 * conversation AND the attachment must be attached to a message in
 * that conversation.
 */
chatRoutes.get('/conversations/:cid/attachments/:aid', async (c) => {
  const cid = c.req.param('cid')
  const aid = c.req.param('aid')
  const db = getDb()
  const service = new ChatService(db)

  const att = await service.getAttachment(aid)
  if (!att || !att.messageId) {
    return c.json(
      { error: { code: 'NOT_FOUND', message: 'Attachment not found' } },
      404,
    )
  }
  // The attachment's message must live in the URL's conversation —
  // mirror the same self-evident-URL guard used by edit/delete.
  const msg = await service.getMessage(att.messageId)
  if (!msg || msg.conversationId !== cid) {
    return c.json(
      { error: { code: 'NOT_FOUND', message: 'Attachment not found' } },
      404,
    )
  }
  try {
    // Reuse listParticipants as the gate.
    await service.listParticipants(cid, c.get('userId'))
  } catch {
    return c.json(
      { error: { code: 'FORBIDDEN', message: 'Not a participant' } },
      403,
    )
  }

  let stream
  try {
    const opened = await openAttachmentStream(aid)
    stream = opened.stream
  } catch {
    return c.json(
      { error: { code: 'NOT_FOUND', message: 'Bytes missing on disk' } },
      404,
    )
  }

  c.header('Content-Type', att.contentType)
  c.header('Content-Length', String(att.sizeBytes))
  c.header(
    'Content-Disposition',
    `inline; filename="${att.filename.replace(/"/g, '')}"`,
  )
  // Hono's stream API takes a ReadableStream — adapt the node stream.
  return new Response(stream as unknown as ReadableStream, {
    status: 200,
    headers: c.res.headers,
  })
})

/**
 * GET /api/v1/chat/search?q=foo&page=1
 * Full-text search across every message the requester has access to,
 * powered by their per-user MeiliSearch index. Returns an empty page
 * when search isn't configured (no MEILI_URL) so clients can fall back
 * to the conversation list.
 */
chatRoutes.get('/search', async (c) => {
  const q = c.req.query('q') ?? ''
  const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10))
  if (q.trim().length === 0) {
    return c.json({ hits: [], total: 0, page, pageSize: 25 })
  }
  const result = await searchChatMessages(c.get('userId'), q, page)
  if (!result) {
    // Search not configured. Return an empty page rather than 503 so
    // the UI degrades gracefully — clients can show "search not
    // available" if they want to differentiate.
    return c.json({ hits: [], total: 0, page, pageSize: 25, available: false })
  }
  return c.json({ ...result, available: true })
})

/**
 * GET /api/v1/chat/users/search?q=alex
 * Searches users in the requester's org by name or email, used by
 * the contact picker on web + mobile NewChat screens.
 */
chatRoutes.get('/users/search', async (c) => {
  const q = c.req.query('q') ?? ''
  if (q.trim().length === 0) {
    return c.json({ users: [] })
  }
  const db = getDb()
  const service = new ChatService(db)
  const matches = await service.searchUsers({
    excludeUserId: c.get('userId'),
    orgId: c.get('orgId'),
    query: q,
  })
  return c.json({ users: matches })
})

/**
 * POST /api/v1/chat/conversations/:id/messages
 * Body: { content: string }
 */
chatRoutes.post('/conversations/:id/messages', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json().catch(() => ({}))
  const schema = z.object({
    // Allow empty content when attachments are present — server will
    // re-validate that one or the other was supplied.
    content: z.string().max(4000).default(''),
    attachmentIds: z.array(z.string().min(1)).max(10).optional(),
  })
  const parsed = schema.safeParse(body)
  if (!parsed.success) throw new ValidationError('Invalid content')

  const db = getDb()
  const service = new ChatService(db)
  const senderId = c.get('userId')
  const senderName = c.get('user').name

  let messageId: string
  let createdAt: Date
  try {
    const result = await service.sendMessage({
      conversationId: id,
      senderId,
      content: parsed.data.content,
      attachmentIds: parsed.data.attachmentIds,
    })
    messageId = result.id
    createdAt = result.createdAt
  } catch (err) {
    const msg = (err as Error).message
    if (msg === 'Not a participant in this conversation') {
      return c.json(
        { error: { code: 'FORBIDDEN', message: 'Not a participant' } },
        403,
      )
    }
    if (
      msg === 'Attachment not found' ||
      msg === 'Attachment not owned by sender' ||
      msg === 'Attachment already attached to a message' ||
      msg === 'Message content or attachment is required'
    ) {
      return c.json({ error: { code: 'BAD_REQUEST', message: msg } }, 400)
    }
    throw err
  }

  // Fan out WS events + push notifications. `chat.message.new`
  // goes to *other* participants only — the sender's current
  // device already added the message optimistically; routing
  // it back would force every client to dedupe by messageId.
  // `chat.conversation.updated` goes to *all* participants
  // (including the sender) so multi-device users see the
  // conversation list reorder on every tab/phone they own.
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

  const participants = await service.listParticipantsWithUnread(id)
  for (const p of participants) {
    eventBus.publish({
      type: 'chat.conversation.updated',
      userId: p.userId,
      conversationId: id,
      lastMessageAt: createdAt.toISOString(),
      unreadCount: p.unreadCount,
    })
  }

  // Index in every participant's chat-search index. Best-effort: a
  // MeiliSearch outage shouldn't fail the send. The fan-out runs
  // detached so the response time is unaffected.
  void (async () => {
    try {
      const conv = await service.getConversation(id)
      await indexChatMessage(
        {
          id: messageId,
          conversationId: id,
          senderId,
          senderName,
          content: parsed.data.content,
          createdAtMs: createdAt.getTime(),
          conversationTitle: conv?.title ?? null,
        },
        participants.map((p) => p.userId),
      )
    } catch (err) {
      console.error('[chat] search index failed:', err)
    }
  })()

  return c.json({ id: messageId, createdAt: createdAt.toISOString() }, 201)
})
