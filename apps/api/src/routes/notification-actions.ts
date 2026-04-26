/// Routes that accept a notification action token (instead of a
/// session cookie) and let an OS-level notification UI act on a
/// resource without opening the app. See
/// `services/notification-tokens.ts` for the token shape.
///
/// Each route:
///   1. Pulls the token from `Authorization: Bearer <token>`.
///   2. `consumeNotificationToken` — verifies signature + expiry +
///      Redis one-shot deny-list (replay protection).
///   3. Asserts the token's `resourceType`, `resourceId`, and
///      `scope` match the URL + endpoint. A token issued for
///      message X can never act on message Y, even if the signature
///      is valid.
///   4. Performs the underlying mutation through the SAME service
///      layer the cookie-authed routes use. Mirrors event publication
///      + side effects so the UX stays consistent across paths.

import { Hono, type Context } from 'hono'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { ValidationError } from '@wistmail/shared'
import { emails, mailboxes } from '@wistmail/db'
import { getDb } from '../lib/db.js'
import { eventBus } from '../events/bus.js'
import { ChatService } from '../services/chat.js'
import { EmailService } from '../services/email.js'
import { EmailSender, EMAIL_STATUS } from '../services/email-sender.js'
import { checkAndReserveSend, refundSend } from '../services/send-rate-limit.js'
import {
  consumeNotificationToken,
  NotificationTokenError,
  type NotificationTokenResource,
  type NotificationTokenScope,
} from '../services/notification-tokens.js'

export const notificationActionRoutes = new Hono()

/// Pulls + consumes the bearer token. Returns the verified payload
/// or sends an HTTP error response and returns null. Centralized so
/// every endpoint surfaces the same error shape.
async function consumeBearer(
  c: Context,
  expected: { resourceType: NotificationTokenResource; resourceId: string; scope: NotificationTokenScope },
): Promise<{ userId: string } | Response> {
  const auth = c.req.header('authorization') ?? ''
  const m = /^Bearer (.+)$/i.exec(auth.trim())
  if (!m) {
    return c.json(
      { error: { code: 'UNAUTHORIZED', message: 'Bearer token required' } },
      401,
    )
  }
  let verified
  try {
    verified = await consumeNotificationToken(m[1])
  } catch (err) {
    if (err instanceof NotificationTokenError) {
      const status = err.code === 'redeemed' ? 409 : 401
      return c.json(
        { error: { code: err.code.toUpperCase().replace(/-/g, '_'), message: err.message } },
        status,
      )
    }
    throw err
  }
  // Resource match — never trust the URL alone; never trust the token
  // alone. A mismatch means someone is trying to use a valid token
  // against the wrong resource.
  if (
    verified.resourceType !== expected.resourceType ||
    verified.resourceId !== expected.resourceId ||
    verified.scope !== expected.scope
  ) {
    return c.json(
      { error: { code: 'FORBIDDEN', message: 'Token scope mismatch' } },
      403,
    )
  }
  return { userId: verified.userId }
}

/**
 * POST /api/v1/notify/emails/:id/quick-reply
 * Bearer: notification-token (resource=email, scope=reply)
 * Body: { content: string }
 *
 * Sends a one-line reply to the original email's sender. Same send
 * pipeline as the regular composer — rate limit + dispatcher + WS
 * status events all fire so the user sees the same outbox state
 * regardless of whether they replied from the app or the
 * notification.
 */
notificationActionRoutes.post('/emails/:id/quick-reply', async (c) => {
  const emailId = c.req.param('id')
  const auth = await consumeBearer(c, {
    resourceType: 'email',
    resourceId: emailId,
    scope: 'reply',
  })
  if (auth instanceof Response) return auth

  const body = await c.req.json().catch(() => ({}))
  const schema = z.object({ content: z.string().min(1).max(4000) })
  const parsed = schema.safeParse(body)
  if (!parsed.success) throw new ValidationError('Invalid content')

  const db = getDb()
  // Pull the original to derive the reply: sender → To, subject → Re:.
  const original = await db
    .select({
      id: emails.id,
      mailboxId: emails.mailboxId,
      fromAddress: emails.fromAddress,
      subject: emails.subject,
      mailboxAddress: mailboxes.address,
      mailboxOwnerId: mailboxes.userId,
    })
    .from(emails)
    .innerJoin(mailboxes, eq(mailboxes.id, emails.mailboxId))
    .where(eq(emails.id, emailId))
    .limit(1)
  if (original.length === 0) {
    return c.json(
      { error: { code: 'NOT_FOUND', message: 'Email not found' } },
      404,
    )
  }
  const o = original[0]
  if (o.mailboxOwnerId !== auth.userId) {
    return c.json(
      { error: { code: 'FORBIDDEN', message: 'Email does not belong to token user' } },
      403,
    )
  }

  // Idempotent subject prefix.
  const subject = /^re:/i.test(o.subject)
    ? o.subject
    : `Re: ${o.subject || '(no subject)'}`
  // Strip display name from "Name <addr>" — we want the raw address.
  const toAddress = (() => {
    const m = /<([^>]+)>/.exec(o.fromAddress)
    return (m ? m[1] : o.fromAddress).trim()
  })()

  const emailService = new EmailService(db)
  const draft = await emailService.createDraft(auth.userId, {
    mailboxId: o.mailboxId,
    fromAddress: o.mailboxAddress,
    toAddresses: [toAddress],
    cc: [],
    bcc: [],
    subject,
    textBody: parsed.data.content,
    inReplyTo: o.id,
  })

  // Same rate-limit + send claim path the regular composer uses.
  const rate = await checkAndReserveSend(auth.userId)
  if (!rate.allowed) {
    await db
      .update(emails)
      .set({
        status: EMAIL_STATUS.RateLimited,
        sendError: `Send limit reached (${rate.scope})`,
        updatedAt: new Date(),
      })
      .where(eq(emails.id, draft.id))
    return c.json(
      { id: draft.id, status: EMAIL_STATUS.RateLimited, rate },
      202,
    )
  }
  const sender = new EmailSender(db)
  const claimed = await sender.claim(draft.id)
  if (claimed) {
    sender.sendEmail(draft.id).catch(async (err) => {
      console.error(`[notify-quick-reply] background send failed for ${draft.id}:`, err)
      await refundSend(auth.userId)
    })
  }
  return c.json({ id: draft.id, status: EMAIL_STATUS.Sending }, 201)
})

/**
 * POST /api/v1/notify/emails/:id/quick-read
 * Bearer: notification-token (resource=email, scope=read)
 *
 * Marks the email as read + fires `email.updated` so other connected
 * devices flip the unread dot in real time.
 */
notificationActionRoutes.post('/emails/:id/quick-read', async (c) => {
  const emailId = c.req.param('id')
  const auth = await consumeBearer(c, {
    resourceType: 'email',
    resourceId: emailId,
    scope: 'read',
  })
  if (auth instanceof Response) return auth

  const db = getDb()
  const emailService = new EmailService(db)
  try {
    await emailService.markRead(emailId, auth.userId)
  } catch (err) {
    // markRead returns silently for unknown ids; swallow to keep the
    // notification action best-effort.
    console.warn('[notify-quick-read] markRead failed:', (err as Error).message)
  }
  eventBus.publish({
    type: 'email.updated',
    userId: auth.userId,
    emailId,
    changes: { isRead: true },
  })
  return c.json({ ok: true })
})

/**
 * POST /api/v1/notify/chat/conversations/:id/quick-reply
 * Bearer: notification-token (resource=chat, scope=reply)
 * Body: { content: string }
 *
 * Posts a chat message via the same `ChatService.sendMessage` the
 * cookie-authed route uses, so WS fan-out + push + search index
 * stay in sync with the in-app send path.
 */
notificationActionRoutes.post(
  '/chat/conversations/:id/quick-reply',
  async (c) => {
    const conversationId = c.req.param('id')
    const auth = await consumeBearer(c, {
      resourceType: 'chat',
      resourceId: conversationId,
      scope: 'reply',
    })
    if (auth instanceof Response) return auth

    const body = await c.req.json().catch(() => ({}))
    const schema = z.object({ content: z.string().min(1).max(4000) })
    const parsed = schema.safeParse(body)
    if (!parsed.success) throw new ValidationError('Invalid content')

    const db = getDb()
    const service = new ChatService(db)
    try {
      const result = await service.sendMessage({
        conversationId,
        senderId: auth.userId,
        content: parsed.data.content,
      })
      return c.json(
        { id: result.id, createdAt: result.createdAt.toISOString() },
        201,
      )
    } catch (err) {
      if ((err as Error).message === 'Not a participant in this conversation') {
        return c.json(
          { error: { code: 'FORBIDDEN', message: 'Not a participant' } },
          403,
        )
      }
      throw err
    }
  },
)

/**
 * POST /api/v1/notify/chat/conversations/:id/quick-read
 * Bearer: notification-token (resource=chat, scope=read)
 *
 * Marks the whole conversation as read (same semantics as the
 * cookie-authed `/chat/conversations/:id/read`).
 */
notificationActionRoutes.post(
  '/chat/conversations/:id/quick-read',
  async (c) => {
    const conversationId = c.req.param('id')
    const auth = await consumeBearer(c, {
      resourceType: 'chat',
      resourceId: conversationId,
      scope: 'read',
    })
    if (auth instanceof Response) return auth

    const db = getDb()
    const service = new ChatService(db)
    try {
      await service.markRead(conversationId, auth.userId)
    } catch (err) {
      if ((err as Error).message === 'Not a participant in this conversation') {
        return c.json(
          { error: { code: 'FORBIDDEN', message: 'Not a participant' } },
          403,
        )
      }
      throw err
    }
    return c.json({ ok: true })
  },
)
