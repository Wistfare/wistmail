import { Hono } from 'hono'
import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { readFile } from 'node:fs/promises'
import { ValidationError } from '@wistmail/shared'
import { attachments, emails, mailboxes } from '@wistmail/db'
import { sessionAuth, type SessionEnv } from '../middleware/session-auth.js'
import { EmailService } from '../services/email.js'
import { EmailSender, EMAIL_STATUS } from '../services/email-sender.js'
import { checkAndReserveSend, refundSend } from '../services/send-rate-limit.js'
import { getDb } from '../lib/db.js'
import { eventBus } from '../events/bus.js'
import { parseIcs, buildRsvpReply, type RsvpResponse } from '../lib/ics.js'
import { pathForAttachment } from '../lib/attachment-storage.js'
import {
  searchEmails,
  searchEnabled,
  updateIndexedEmail,
  deleteIndexedEmail,
} from '../services/search.js'

const MAIL_ENGINE_URL = process.env.MAIL_ENGINE_URL || 'http://mail-engine:8025'
const INBOUND_SECRET = process.env.INBOUND_SECRET || ''

export const inboxRoutes = new Hono<SessionEnv>()

inboxRoutes.use('*', sessionAuth)

/**
 * GET /api/v1/inbox/emails?folder=inbox&page=1&pageSize=25
 */
inboxRoutes.get('/emails', async (c) => {
  const folder = c.req.query('folder') || 'inbox'
  const page = parseInt(c.req.query('page') || '1', 10)
  const pageSize = parseInt(c.req.query('pageSize') || '25', 10)

  const db = getDb()
  const emailService = new EmailService(db)
  const result = await emailService.listByFolder(c.get('userId'), folder, page, pageSize)

  return c.json(result)
})

/**
 * GET /api/v1/inbox/emails/:id
 */
inboxRoutes.get('/emails/:id', async (c) => {
  const emailId = c.req.param('id')
  const db = getDb()
  const emailService = new EmailService(db)
  const email = await emailService.getById(emailId, c.get('userId'))

  if (!email) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Email not found' } }, 404)
  }

  return c.json(email)
})

/**
 * POST /api/v1/inbox/emails/:id/read
 */
inboxRoutes.post('/emails/:id/read', async (c) => {
  const emailId = c.req.param('id')
  const userId = c.get('userId')
  const db = getDb()
  const emailService = new EmailService(db)
  await emailService.markRead(emailId, userId)
  updateIndexedEmail(userId, emailId, { isRead: true }).catch(() => {})
  eventBus.publish({
    type: 'email.updated',
    userId,
    emailId,
    changes: { isRead: true },
  })
  return c.json({ ok: true })
})

/**
 * POST /api/v1/inbox/emails/:id/unread
 */
inboxRoutes.post('/emails/:id/unread', async (c) => {
  const emailId = c.req.param('id')
  const userId = c.get('userId')
  const db = getDb()
  const emailService = new EmailService(db)
  await emailService.markUnread(emailId, userId)
  updateIndexedEmail(userId, emailId, { isRead: false }).catch(() => {})
  eventBus.publish({
    type: 'email.updated',
    userId,
    emailId,
    changes: { isRead: false },
  })
  return c.json({ ok: true })
})

/**
 * POST /api/v1/inbox/emails/:id/star
 */
inboxRoutes.post('/emails/:id/star', async (c) => {
  const emailId = c.req.param('id')
  const userId = c.get('userId')
  const db = getDb()
  const emailService = new EmailService(db)
  const starred = await emailService.toggleStar(emailId, userId)
  updateIndexedEmail(userId, emailId, { isStarred: starred ?? false }).catch(() => {})
  eventBus.publish({
    type: 'email.updated',
    userId,
    emailId,
    changes: { isStarred: starred ?? false },
  })
  return c.json({ starred })
})

/**
 * POST /api/v1/inbox/emails/:id/archive
 */
inboxRoutes.post('/emails/:id/archive', async (c) => {
  const emailId = c.req.param('id')
  const userId = c.get('userId')
  const db = getDb()
  const emailService = new EmailService(db)
  await emailService.archive(emailId, userId)
  updateIndexedEmail(userId, emailId, { folder: 'archive' }).catch(() => {})
  eventBus.publish({
    type: 'email.updated',
    userId,
    emailId,
    changes: { folder: 'archive' },
  })
  return c.json({ ok: true })
})

/**
 * POST /api/v1/inbox/emails/:id/delete
 */
inboxRoutes.post('/emails/:id/delete', async (c) => {
  const emailId = c.req.param('id')
  const userId = c.get('userId')
  const db = getDb()
  const emailService = new EmailService(db)
  await emailService.delete(emailId, userId)
  // Move to trash + drop from search index. We don't search trash by default.
  deleteIndexedEmail(userId, emailId).catch(() => {})
  eventBus.publish({
    type: 'email.deleted',
    userId,
    emailId,
  })
  return c.json({ ok: true })
})

/**
 * POST /api/v1/inbox/emails/:id/move
 */
inboxRoutes.post('/emails/:id/move', async (c) => {
  const body = await c.req.json()
  const schema = z.object({ folder: z.string() })
  const parsed = schema.safeParse(body)
  if (!parsed.success) throw new ValidationError('Invalid folder')

  const emailId = c.req.param('id')
  const db = getDb()
  const emailService = new EmailService(db)
  await emailService.moveToFolder(emailId, c.get('userId'), parsed.data.folder)
  return c.json({ ok: true })
})

/**
 * GET /api/v1/inbox/unread-counts
 */
inboxRoutes.get('/unread-counts', async (c) => {
  const db = getDb()
  const emailService = new EmailService(db)
  const counts = await emailService.getUnreadCounts(c.get('userId'))
  return c.json(counts)
})

/**
 * GET /api/v1/inbox/search?q=query&page=1&pageSize=25
 *
 * Routes through MeiliSearch when enabled (covers full-text body match);
 * falls back to a slim SQL ILIKE on subject + from when MeiliSearch is
 * unreachable so the app never appears broken on a cold deploy.
 */
inboxRoutes.get('/search', async (c) => {
  const query = c.req.query('q') || ''
  const page = parseInt(c.req.query('page') || '1', 10)
  const pageSize = Math.min(parseInt(c.req.query('pageSize') || '25', 10), 100)
  if (!query.trim()) {
    return c.json({ data: [], total: 0, page, pageSize, hasMore: false })
  }

  if (searchEnabled()) {
    const meili = await searchEmails(c.get('userId'), query, page, pageSize)
    if (meili) return c.json(meili)
  }

  const db = getDb()
  const emailService = new EmailService(db)
  const fallback = await emailService.search(c.get('userId'), query, page, pageSize)
  return c.json(fallback)
})

/**
 * POST /api/v1/inbox/compose
 * Save a draft or send an email
 */
inboxRoutes.post('/compose', async (c) => {
  const body = await c.req.json()
  const schema = z.object({
    fromAddress: z.string(),
    toAddresses: z.array(z.string().email()),
    cc: z.array(z.string().email()).optional(),
    bcc: z.array(z.string().email()).optional(),
    subject: z.string(),
    textBody: z.string().optional(),
    htmlBody: z.string().optional(),
    mailboxId: z.string(),
    inReplyTo: z.string().optional(),
    scheduledAt: z.string().optional(),
    send: z.boolean().default(false),
  })

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    throw new ValidationError('Invalid email', { errors: parsed.error.flatten().fieldErrors })
  }

  const db = getDb()
  const emailService = new EmailService(db)

  // Validate fromAddress belongs to the user's mailbox
  const userMailboxes = await db
    .select()
    .from(mailboxes)
    .where(eq(mailboxes.userId, c.get('userId')))
  const validAddresses = userMailboxes.map((m) => m.address.toLowerCase())
  if (!validAddresses.includes(parsed.data.fromAddress.toLowerCase())) {
    throw new ValidationError('You can only send from your own email addresses')
  }
  // Validate mailboxId belongs to the user
  if (!userMailboxes.some((m) => m.id === parsed.data.mailboxId)) {
    throw new ValidationError('Invalid mailbox')
  }

  if (parsed.data.send) {
    const userId = c.get('userId')

    // Per-user send rate limit. If we're over budget the draft still
    // gets persisted in 'rate_limited' state — the dispatcher loop
    // will retry it automatically when the window rolls over, and the
    // UI can render it in the Outbox with a "Sending later…" pill.
    const rate = await checkAndReserveSend(userId)

    const result = await emailService.createDraft(userId, {
      ...parsed.data,
      mailboxId: parsed.data.mailboxId,
    })

    if (!rate.allowed) {
      // Stamp the email as rate_limited; user sees it in Outbox.
      await db
        .update(emails)
        .set({
          status: EMAIL_STATUS.RateLimited,
          sendError: `Send limit reached (${rate.scope})`,
          updatedAt: new Date(),
        })
        .where(eq(emails.id, result.id))
      return c.json(
        {
          id: result.id,
          status: EMAIL_STATUS.RateLimited,
          rate: {
            scope: rate.scope,
            retryAfterMs: rate.retryAfterMs,
            hourCount: rate.hourCount,
            dayCount: rate.dayCount,
          },
        },
        202,
      )
    }

    const sender = new EmailSender(db)
    // Claim atomically (idle → sending) and kick off the actual send
    // in the background. The HTTP response returns immediately so the
    // client can show "Sending…" without waiting on mail-engine.
    const claimed = await sender.claim(result.id)
    if (claimed) {
      sender.sendEmail(result.id).catch(async (err) => {
        console.error(`[compose] background send threw for ${result.id}:`, err)
        await refundSend(userId)
      })
    }

    return c.json({ id: result.id, status: EMAIL_STATUS.Sending }, 201)
  }

  const result = await emailService.createDraft(c.get('userId'), parsed.data)
  return c.json({ id: result.id, status: 'draft' }, 201)
})

/**
 * POST /api/v1/inbox/emails/:id/dispatch
 *
 * User-initiated retry for an email currently in 'failed' or
 * 'rate_limited'. The dispatcher loop covers automatic retries; this
 * endpoint covers the "Tap to retry" affordance after a hard failure
 * or the user wanting to send-now from the Outbox.
 */
inboxRoutes.post('/emails/:id/dispatch', async (c) => {
  const emailId = c.req.param('id')
  const userId = c.get('userId')
  const db = getDb()

  // Authorization — only the owner of the email's mailbox can dispatch.
  const owned = await db
    .select({ id: emails.id, status: emails.status })
    .from(emails)
    .innerJoin(mailboxes, eq(emails.mailboxId, mailboxes.id))
    .where(and(eq(emails.id, emailId), eq(mailboxes.userId, userId)))
    .limit(1)
  if (owned.length === 0) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Email not found' } }, 404)
  }

  const rate = await checkAndReserveSend(userId)
  if (!rate.allowed) {
    return c.json(
      {
        error: {
          code: 'RATE_LIMITED',
          message: `Send limit reached for the ${rate.scope}.`,
          details: {
            scope: rate.scope,
            retryAfterMs: rate.retryAfterMs,
          },
        },
      },
      429,
    )
  }

  const sender = new EmailSender(db)
  const claimed = await sender.claim(emailId)
  if (!claimed) {
    return c.json(
      {
        error: {
          code: 'INVALID_STATE',
          message: 'Email is already sending or has been sent.',
        },
      },
      409,
    )
  }

  sender.sendEmail(emailId).catch(async (err) => {
    console.error(`[dispatch] background send threw for ${emailId}:`, err)
    await refundSend(userId)
  })

  return c.json({ id: emailId, status: EMAIL_STATUS.Sending }, 202)
})

/**
 * POST /api/v1/inbox/emails/:id/attachments/:aid/rsvp
 *
 * Send a METHOD:REPLY ICS back to the invite's organizer reflecting
 * the user's accept/tentative/decline choice. We bypass the normal
 * draft→claim→send pipeline because RSVPs aren't "drafts" — they're a
 * single atomic acknowledgement and the UI doesn't want them cluttering
 * the Drafts folder while in flight. The response is fire-and-forget:
 * on success we write a `sendingLogs` entry and optionally drop a row
 * in the emails table (folder='sent') so the user can find the reply
 * in their Sent list.
 */
/// Hard cap on ICS bytes we'll parse — `ical.js` has a rich grammar
/// and regex-catastrophic-backtracking risk on hostile input. 256 KB
/// covers every real invite (they're ~2 KB) and is small enough that
/// an attacker crafting a pathological file can't stall the event
/// loop for long.
const MAX_ICS_BYTES = 256 * 1024

/// Strip anything that could terminate a header mid-value. Display
/// names are user-controlled; mail-engine writes them verbatim into
/// the From header with no sanitization of its own, so header
/// injection is a live risk without this gate.
function sanitizeHeaderValue(v: string): string {
  return v.replace(/[\r\n]+/g, ' ').replace(/"/g, '').trim()
}

inboxRoutes.post('/emails/:id/attachments/:aid/rsvp', async (c) => {
  const emailId = c.req.param('id')
  const attachmentId = c.req.param('aid')
  const userId = c.get('userId')

  const body = await c.req.json().catch(() => ({}))
  const parsed = z
    .object({ response: z.enum(['accept', 'tentative', 'decline']) })
    .safeParse(body)
  if (!parsed.success) throw new ValidationError('Invalid response')
  const response = parsed.data.response as RsvpResponse

  // Gate abuse at the door: RSVP replies count against the same
  // per-user send budget as compose/dispatch. Without this an attacker
  // who can plant an invite into their own mailbox could drive
  // unlimited outbound mail by varying the ORGANIZER header.
  const rate = await checkAndReserveSend(userId)
  if (!rate.allowed) {
    return c.json(
      {
        error: {
          code: 'RATE_LIMITED',
          message: `Send limit reached for the ${rate.scope}.`,
          details: { scope: rate.scope, retryAfterMs: rate.retryAfterMs },
        },
      },
      429,
    )
  }

  const db = getDb()
  // Ownership check in one join — email must belong to a mailbox the
  // user owns, AND the attachment must belong to that email. We load
  // the mailbox address to use as the From on the reply. `storageKey`
  // is also pulled so we read bytes via the stored path instead of
  // recomputing from id (defence in depth against future callers
  // passing untrusted ids).
  const rows = await db
    .select({
      attachmentId: attachments.id,
      contentType: attachments.contentType,
      filename: attachments.filename,
      storageKey: attachments.storageKey,
      rsvpResponse: attachments.rsvpResponse,
      mailboxAddress: mailboxes.address,
      mailboxDisplayName: mailboxes.displayName,
      senderAddress: emails.fromAddress,
    })
    .from(attachments)
    .innerJoin(emails, eq(emails.id, attachments.emailId))
    .innerJoin(mailboxes, eq(mailboxes.id, emails.mailboxId))
    .where(
      and(
        eq(attachments.id, attachmentId),
        eq(emails.id, emailId),
        eq(mailboxes.userId, userId),
      ),
    )
    .limit(1)

  if (rows.length === 0) {
    await refundSend(userId)
    return c.json(
      { error: { code: 'NOT_FOUND', message: 'Invite not found' } },
      404,
    )
  }
  const row = rows[0]

  // Dedupe: if the user already responded with the same choice, no
  // need to send a second reply. If they're changing their mind
  // (accept → decline), we let the new reply through and stamp the
  // new choice over the old one. Without this guard a user could
  // spam the organizer by tapping "Yes" repeatedly.
  if (row.rsvpResponse === response) {
    await refundSend(userId)
    return c.json({ ok: true, response, deduped: true })
  }

  // Only genuine calendar attachments are eligible. Without this the
  // endpoint would happily parse a PDF or PNG as ICS and extract a
  // ORGANIZER line from any random bytes — turning the endpoint into
  // an attacker-controlled mailer.
  const ct = (row.contentType || '').toLowerCase()
  const isIcs = ct.includes('text/calendar') || row.filename.toLowerCase().endsWith('.ics')
  if (!isIcs) {
    await refundSend(userId)
    return c.json(
      {
        error: {
          code: 'NOT_AN_INVITE',
          message: 'That attachment is not a calendar invite.',
        },
      },
      422,
    )
  }

  // Read the raw ICS bytes from disk (via the stored key, not a
  // recomputed path), parse, and build a REPLY. Reject oversize files
  // before handing them to ical.js.
  let icsText: string
  try {
    icsText = await readFile(pathForAttachment(row.attachmentId), 'utf8')
  } catch (err) {
    await refundSend(userId)
    console.error('[rsvp] storage read failed:', err)
    return c.json(
      {
        error: {
          code: 'GONE',
          message: 'Invite bytes are no longer available.',
        },
      },
      410,
    )
  }
  if (Buffer.byteLength(icsText, 'utf8') > MAX_ICS_BYTES) {
    await refundSend(userId)
    return c.json(
      {
        error: {
          code: 'INVITE_TOO_LARGE',
          message: 'Invite exceeds the safe size limit for parsing.',
        },
      },
      413,
    )
  }
  const invite = parseIcs(icsText)
  if (!invite || !invite.organizer?.email) {
    await refundSend(userId)
    return c.json(
      {
        error: {
          code: 'INVALID_INVITE',
          message: 'Invite is missing an organizer — cannot reply.',
        },
      },
      422,
    )
  }

  // Only allow sending the REPLY to the organizer that actually sent
  // the email, or to the sender's domain. This kills the abuse path
  // where an attacker plants a self-addressed invite with
  // `ORGANIZER:mailto:victim@external.com` and drives outbound mail
  // to arbitrary addresses from the user's verified mailbox.
  const senderLower = (row.senderAddress || '').toLowerCase()
  const orgLower = invite.organizer.email.toLowerCase()
  const senderDomain = senderLower.split('@')[1] ?? ''
  const orgDomain = orgLower.split('@')[1] ?? ''
  const organizerAllowed =
    senderLower === orgLower ||
    (senderDomain.length > 0 && senderDomain === orgDomain)
  if (!organizerAllowed) {
    await refundSend(userId)
    return c.json(
      {
        error: {
          code: 'ORGANIZER_MISMATCH',
          message:
            "The invite's organizer doesn't match who sent this email. Refusing to send a reply to a third party.",
        },
      },
      422,
    )
  }

  const safeDisplayName = row.mailboxDisplayName
    ? sanitizeHeaderValue(row.mailboxDisplayName)
    : ''
  const reply = buildRsvpReply({
    invite,
    attendeeEmail: row.mailboxAddress,
    attendeeName: safeDisplayName || null,
    response,
  })

  // Human-readable subject/body — calendar clients use the ICS part,
  // but humans reading the reply in a plain mail client still want to
  // see what happened.
  const VERBS: Record<RsvpResponse, string> = {
    accept: 'Accepted',
    tentative: 'Tentative',
    decline: 'Declined',
  }
  const verb = VERBS[response]
  const summary = invite.summary || 'invitation'
  const subject = sanitizeHeaderValue(`${verb}: ${summary}`)
  const text = `${verb}: ${summary}\n\nThis is an automated RSVP from WistMail.`

  const fromHeader = safeDisplayName
    ? `"${safeDisplayName}" <${row.mailboxAddress}>`
    : row.mailboxAddress

  try {
    const engineRes = await fetch(`${MAIL_ENGINE_URL}/api/v1/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Inbound-Secret': INBOUND_SECRET,
      },
      // Cap the round-trip so a slow/stuck mail-engine doesn't tie up
      // the user's HTTP connection (and Node event-loop resources)
      // indefinitely.
      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({
        from: fromHeader,
        to: [invite.organizer.email],
        subject,
        text,
        icalendar: reply,
        icalendarMethod: 'REPLY',
      }),
    })
    if (!engineRes.ok) {
      const data = (await engineRes.json().catch(() => ({}))) as { error?: string }
      console.error('[rsvp] mail-engine rejected:', data.error || engineRes.status)
      // Hard rejection — refund the rate-limit slot since nothing went
      // out. The user can retry later.
      await refundSend(userId)
      return c.json(
        {
          error: {
            code: 'SEND_FAILED',
            message: data.error || 'Mail engine rejected the reply.',
          },
        },
        502,
      )
    }
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === 'TimeoutError'
    console.error(
      `[rsvp] mail-engine ${isTimeout ? 'timed out' : 'fetch failed'}:`,
      err,
    )
    await refundSend(userId)
    return c.json(
      {
        error: {
          code: 'SEND_FAILED',
          message: isTimeout
            ? 'Mail engine timed out. Please retry in a moment.'
            : 'Could not reach mail engine.',
        },
      },
      isTimeout ? 504 : 502,
    )
  }

  // Record the response so subsequent POSTs can dedupe and the
  // client can re-render the confirmation pill after navigating away
  // and back. Fire-and-forget — a stale read won't cause a double
  // send because the dedupe check above runs on every request.
  await db
    .update(attachments)
    .set({ rsvpResponse: response, rsvpRespondedAt: new Date() })
    .where(eq(attachments.id, attachmentId))

  return c.json({ ok: true, response })
})
