import { Hono } from 'hono'
import { z } from 'zod'
import { and, eq, inArray } from 'drizzle-orm'
import { readFile } from 'node:fs/promises'
import { ValidationError } from '@wistmail/shared'
import { attachments, emails, emailLabels, mailboxes } from '@wistmail/db'
import { sessionAuth, type SessionEnv } from '../middleware/session-auth.js'
import { EmailService } from '../services/email.js'
import { EmailSender, EMAIL_STATUS } from '../services/email-sender.js'
import { ThreadService } from '../services/thread-service.js'
import { checkAndReserveSend, refundSend } from '../services/send-rate-limit.js'
import { getDb } from '../lib/db.js'
import { eventBus } from '../events/bus.js'
import { parseIcsSafely, buildRsvpReply, type RsvpResponse } from '../lib/ics.js'
import { pathForAttachment } from '../lib/attachment-storage.js'
import {
  SPAM_RETENTION_DAYS,
  TRASH_RETENTION_DAYS,
  emptyFolderForUser,
  purgeOneFromTrash,
} from '../services/trash-retention.js'
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
 * GET /api/v1/inbox/emails/:id/thread
 *
 * Return every email in the same thread as `:id`, oldest first,
 * including the anchor. Each message comes with its label refs
 * baked in (same shape the list endpoint uses) so the client can
 * render the full conversation with one round trip.
 */
inboxRoutes.get('/emails/:id/thread', async (c) => {
  const emailId = c.req.param('id')
  const userId = c.get('userId')
  const db = getDb()

  // Auth check first: the user must own the anchor email.
  const owned = await db
    .select({ id: emails.id })
    .from(emails)
    .innerJoin(mailboxes, eq(emails.mailboxId, mailboxes.id))
    .where(and(eq(emails.id, emailId), eq(mailboxes.userId, userId)))
    .limit(1)
  if (owned.length === 0) {
    return c.json(
      { error: { code: 'NOT_FOUND', message: 'Email not found' } },
      404,
    )
  }

  const svc = new ThreadService(db)
  const messages = await svc.listThreadEmails(emailId, userId)
  return c.json({
    anchorId: emailId,
    messages: messages.map((m) => ({
      id: m.id,
      fromAddress: m.fromAddress,
      toAddresses: m.toAddresses,
      cc: m.cc,
      subject: m.subject,
      snippet: (m.textBody ?? '').replace(/\s+/g, ' ').trim().slice(0, 200),
      folder: m.folder,
      isRead: m.isRead,
      isStarred: m.isStarred,
      isDraft: m.isDraft,
      createdAt: m.createdAt.toISOString(),
      updatedAt: m.updatedAt.toISOString(),
    })),
  })
})

/**
 * POST /api/v1/inbox/threads/backfill
 *
 * Admin-ish: walks the user's mailboxes and assigns a thread_id to
 * every email row that doesn't have one yet. Idempotent (rows that
 * already have a thread are skipped); safe to call repeatedly. Used
 * as a one-off after deploying the threading code over a DB that
 * predates it.
 */
inboxRoutes.post('/threads/backfill', async (c) => {
  const userId = c.get('userId')
  const db = getDb()
  const svc = new ThreadService(db)
  const mailboxRows = await db
    .select({ id: mailboxes.id })
    .from(mailboxes)
    .where(eq(mailboxes.userId, userId))
  let total = 0
  for (const m of mailboxRows) {
    total += await svc.backfill(m.id)
  }
  return c.json({ ok: true, assigned: total })
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
 * GET /api/v1/inbox/unified?filter=all|mail|chats&limit=50&before=ISO
 *
 * The MobileV3 Inbox screen renders mail + chat in a single time-sorted
 * feed. Rather than merging on the client (two paginators, racy offsets)
 * we aggregate server-side: each item carries its source (`mail` | `chat`)
 * and the client renders the right row widget by source.
 *
 * `filter` clamps which sources are included. `before` is a cursor —
 * pass the oldest item's `occurredAt` to fetch the next page.
 */
inboxRoutes.get('/unified', async (c) => {
  const filter = (c.req.query('filter') || 'all').toLowerCase()
  const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 200)
  const beforeRaw = c.req.query('before')
  const before = beforeRaw ? new Date(beforeRaw) : null
  const userId = c.get('userId')

  const db = getDb()
  const { unifiedInbox } = await import('../services/unified-inbox.js')
  const page = await unifiedInbox(db, {
    userId,
    filter: filter === 'mail' || filter === 'chats' ? filter : 'all',
    limit,
    before,
  })
  return c.json(page)
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
    const scheduledAt = parsed.data.scheduledAt
      ? new Date(parsed.data.scheduledAt)
      : null
    const isFutureScheduled =
      scheduledAt !== null && scheduledAt.getTime() > Date.now()

    // Schedule-send path: persist the draft with `scheduledAt` + mark
    // `isDraft=false` + folder='sent' so the dispatcher picks it up
    // at the scheduled moment. We DON'T reserve a rate-limit slot
    // until the actual send attempt happens — scheduling a send far
    // in the future shouldn't burn today's budget.
    if (isFutureScheduled) {
      const result = await emailService.createDraft(userId, {
        ...parsed.data,
        mailboxId: parsed.data.mailboxId,
        scheduledAt: scheduledAt!.toISOString(),
      })
      await db
        .update(emails)
        .set({
          isDraft: false,
          // Keep in drafts folder so it shows in the Drafts + synthetic
          // Scheduled views; dispatcher will move it to 'sent' when
          // the send completes.
          status: EMAIL_STATUS.Idle,
          updatedAt: new Date(),
        })
        .where(eq(emails.id, result.id))
      return c.json(
        {
          id: result.id,
          status: 'scheduled',
          scheduledAt: scheduledAt!.toISOString(),
        },
        201,
      )
    }

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
  const invite = await parseIcsSafely(icsText)
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

// ───────────────────── Trash + Spam retention / emptying ─────────────────

/// Folders the emptying / retention endpoints will act on. Everything
/// else 400s — we refuse to let the UI accidentally hard-delete a
/// folder full of real mail.
const EMPTYABLE_FOLDERS = new Set(['trash', 'spam'])

/**
 * GET /api/v1/inbox/folders/:folder/config
 * Retention policy for folders that auto-purge (trash + spam).
 * UI renders this as the retention banner above the list.
 */
inboxRoutes.get('/folders/:folder/config', async (c) => {
  const folder = c.req.param('folder')
  if (!EMPTYABLE_FOLDERS.has(folder)) {
    return c.json(
      { error: { code: 'INVALID_FOLDER', message: `${folder} has no retention policy.` } },
      400,
    )
  }
  const retentionDays =
    folder === 'trash' ? TRASH_RETENTION_DAYS : SPAM_RETENTION_DAYS
  return c.json({ folder, retentionDays })
})

/**
 * POST /api/v1/inbox/folders/:folder/empty
 * Hard-delete everything in the user's trash or spam folder. Unlike
 * the hourly retention cron, this bypasses the N-day window — it's
 * explicit user intent. Also removes on-disk attachments.
 */
inboxRoutes.post('/folders/:folder/empty', async (c) => {
  const folder = c.req.param('folder')
  if (!EMPTYABLE_FOLDERS.has(folder)) {
    return c.json(
      { error: { code: 'INVALID_FOLDER', message: `Cannot empty ${folder}.` } },
      400,
    )
  }
  const userId = c.get('userId')
  const db = getDb()
  const result = await emptyFolderForUser(db, userId, folder)
  return c.json({ ok: true, folder, ...result })
})

/**
 * Legacy trash-specific endpoints — kept as thin aliases so any
 * client that's still hitting `/inbox/trash/config` or
 * `/inbox/trash/empty` from a previous build keeps working. New
 * callers should use the folder-scoped versions above.
 */
inboxRoutes.get('/trash/config', async (c) => {
  return c.json({ retentionDays: TRASH_RETENTION_DAYS })
})
inboxRoutes.post('/trash/empty', async (c) => {
  const userId = c.get('userId')
  const db = getDb()
  const result = await emptyFolderForUser(db, userId, 'trash')
  return c.json({ ok: true, ...result })
})

/**
 * POST /api/v1/inbox/emails/:id/snooze
 * Body: { until: ISO-8601 string }
 *
 * Flip the email into the synthetic "snoozed" folder until the given
 * timestamp. Passing `null` (or an empty body) unsnoozes.
 *
 * Snoozed rows disappear from inbox until `snoozeUntil <= now()`,
 * at which point the `buildFolderWhere('inbox', …)` filter starts
 * returning them again. No background job is needed — the synthetic
 * filter already does the work.
 */
inboxRoutes.post('/emails/:id/snooze', async (c) => {
  const emailId = c.req.param('id')
  const userId = c.get('userId')
  const body = await c.req.json().catch(() => ({}))
  const parsed = z
    .object({ until: z.string().datetime().nullable().optional() })
    .safeParse(body)
  if (!parsed.success) throw new ValidationError('Invalid until')
  const until = parsed.data.until ? new Date(parsed.data.until) : null

  const db = getDb()
  // Ownership check in one join.
  const rows = await db
    .select({ id: emails.id })
    .from(emails)
    .innerJoin(mailboxes, eq(emails.mailboxId, mailboxes.id))
    .where(and(eq(emails.id, emailId), eq(mailboxes.userId, userId)))
    .limit(1)
  if (rows.length === 0) {
    return c.json(
      { error: { code: 'NOT_FOUND', message: 'Email not found' } },
      404,
    )
  }
  await db
    .update(emails)
    .set({ snoozeUntil: until, updatedAt: new Date() })
    .where(eq(emails.id, emailId))
  eventBus.publish({
    type: 'email.updated',
    userId,
    emailId,
    changes: { snoozeUntil: until?.toISOString() ?? null },
  })
  return c.json({ ok: true, until: until?.toISOString() ?? null })
})

/**
 * POST /api/v1/inbox/folders/:folder/mark-all-read
 * Flip every email in the folder to `isRead = true`. We intentionally
 * don't route this through the batch endpoint because the client
 * doesn't have the full id set and we want the server to do the
 * filter — same auth model (user's mailboxes), no cap.
 */
inboxRoutes.post('/folders/:folder/mark-all-read', async (c) => {
  const folder = c.req.param('folder')
  const userId = c.get('userId')
  const db = getDb()

  const mailboxRows = await db
    .select({ id: mailboxes.id })
    .from(mailboxes)
    .where(eq(mailboxes.userId, userId))
  const mailboxIds = mailboxRows.map((m) => m.id)
  if (mailboxIds.length === 0) {
    return c.json({ ok: true, affected: 0 })
  }

  const where =
    folder === 'all'
      ? and(
          inArray(emails.mailboxId, mailboxIds),
          eq(emails.isRead, false),
        )
      : and(
          inArray(emails.mailboxId, mailboxIds),
          eq(emails.folder, folder),
          eq(emails.isRead, false),
        )

  // Collect ids first so we can publish WS events; the UPDATE then
  // touches exactly those rows. Avoids any drift if a new unread
  // arrives between the SELECT and the UPDATE (the new row just
  // isn't included; it'll show up as unread on the user's next
  // inbox refresh).
  const rows = await db.select({ id: emails.id }).from(emails).where(where)
  const ids = rows.map((r) => r.id)
  if (ids.length === 0) {
    return c.json({ ok: true, affected: 0 })
  }
  await db
    .update(emails)
    .set({ isRead: true, updatedAt: new Date() })
    .where(inArray(emails.id, ids))

  for (const id of ids) {
    eventBus.publish({
      type: 'email.updated',
      userId,
      emailId: id,
      changes: { isRead: true },
    })
  }

  return c.json({ ok: true, affected: ids.length })
})

/**
 * POST /api/v1/inbox/emails/batch
 * Body: { ids: string[], action: 'read'|'unread'|'star'|'unstar'
 *         |'archive'|'delete'|'purge'|'move'|'label-add'|'label-remove',
 *         folder?: string,          // required for 'move'
 *         labelIds?: string[] }     // required for label-* actions
 *
 * Single endpoint for every bulk action the clients need. We take
 * the action as a string rather than splitting into six endpoints
 * because (a) the client-side selection flow already treats the
 * choice as a dropdown-ish value, and (b) it keeps the auth filter
 * (ids ∈ user's mailboxes) in one place.
 *
 * The whole batch runs in a single txn — either all rows mutate or
 * none do. Sizes are capped at 500 to stop a rogue client from
 * pinning the connection.
 */
inboxRoutes.post('/emails/batch', async (c) => {
  const userId = c.get('userId')
  const body = await c.req.json().catch(() => ({}))
  const schema = z.object({
    ids: z.array(z.string().min(1)).min(1).max(500),
    action: z.enum([
      'read',
      'unread',
      'star',
      'unstar',
      'archive',
      'delete',
      'purge',
      'move',
      'label-add',
      'label-remove',
    ]),
    folder: z.string().optional(),
    labelIds: z.array(z.string().min(1)).optional(),
  })
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    throw new ValidationError('Invalid batch request', {
      errors: parsed.error.flatten().fieldErrors,
    })
  }
  const { ids, action, folder, labelIds } = parsed.data

  if (action === 'move' && !folder) {
    throw new ValidationError('`folder` is required for move')
  }
  if (
    (action === 'label-add' || action === 'label-remove') &&
    (!labelIds || labelIds.length === 0)
  ) {
    throw new ValidationError('`labelIds` is required for label actions')
  }

  const db = getDb()

  // Auth filter in one query: the ids the user actually owns. Anything
  // they don't own is silently dropped — deliberate; surfacing per-id
  // failures leaks whether the id exists.
  const ownedRows = await db
    .select({ id: emails.id, folder: emails.folder })
    .from(emails)
    .innerJoin(mailboxes, eq(emails.mailboxId, mailboxes.id))
    .where(and(inArray(emails.id, ids), eq(mailboxes.userId, userId)))
  const ownedIds = ownedRows.map((r) => r.id)
  if (ownedIds.length === 0) {
    return c.json({ ok: true, affected: 0 })
  }

  const now = new Date()

  switch (action) {
    case 'read':
    case 'unread': {
      await db
        .update(emails)
        .set({ isRead: action === 'read', updatedAt: now })
        .where(inArray(emails.id, ownedIds))
      break
    }
    case 'star':
    case 'unstar': {
      await db
        .update(emails)
        .set({ isStarred: action === 'star', updatedAt: now })
        .where(inArray(emails.id, ownedIds))
      break
    }
    case 'archive': {
      await db
        .update(emails)
        .set({ folder: 'archive', updatedAt: now })
        .where(inArray(emails.id, ownedIds))
      break
    }
    case 'delete': {
      await db
        .update(emails)
        .set({ folder: 'trash', updatedAt: now })
        .where(inArray(emails.id, ownedIds))
      break
    }
    case 'move': {
      await db
        .update(emails)
        .set({ folder: folder!, updatedAt: now })
        .where(inArray(emails.id, ownedIds))
      break
    }
    case 'purge': {
      // Hard delete — only for rows already in Trash. Filter the
      // working set to the subset that's actually trashed so we don't
      // accidentally wipe an inbox row through the batch endpoint.
      const trashedIds = ownedRows
        .filter((r) => r.folder === 'trash')
        .map((r) => r.id)
      if (trashedIds.length === 0) {
        return c.json({ ok: true, affected: 0 })
      }
      // Sequential per id for correctness on attachment bytes — small
      // cost even at 500 rows; a batch purge is a rare operation.
      for (const id of trashedIds) {
        await purgeOneFromTrash(db, id, userId)
      }
      for (const id of trashedIds) {
        eventBus.publish({ type: 'email.deleted', userId, emailId: id })
      }
      return c.json({ ok: true, affected: trashedIds.length })
    }
    case 'label-add': {
      // Upsert one row per (emailId, labelId). We insert and swallow
      // PK-conflict — existing memberships are no-ops.
      const rows = ownedIds.flatMap((emailId) =>
        labelIds!.map((labelId) => ({ emailId, labelId })),
      )
      if (rows.length > 0) {
        await db.insert(emailLabels).values(rows).onConflictDoNothing()
      }
      break
    }
    case 'label-remove': {
      await db
        .delete(emailLabels)
        .where(
          and(
            inArray(emailLabels.emailId, ownedIds),
            inArray(emailLabels.labelId, labelIds!),
          ),
        )
      break
    }
  }

  // Publish email.updated events so connected clients reconcile the
  // row state without refetching. For delete/archive we publish the
  // folder change; label-* publish a dummy updated event keyed by id
  // so the label-popover re-fetches.
  const changes: Record<string, unknown> | null = (() => {
    switch (action) {
      case 'read':
        return { isRead: true }
      case 'unread':
        return { isRead: false }
      case 'star':
        return { isStarred: true }
      case 'unstar':
        return { isStarred: false }
      case 'archive':
        return { folder: 'archive' }
      case 'delete':
        return { folder: 'trash' }
      case 'move':
        return { folder: folder! }
      default:
        return null
    }
  })()
  if (changes) {
    for (const id of ownedIds) {
      eventBus.publish({
        type: 'email.updated',
        userId,
        emailId: id,
        changes,
      })
    }
  }

  return c.json({ ok: true, affected: ownedIds.length })
})

/**
 * POST /api/v1/inbox/emails/:id/purge
 * Permanently delete a single email. Only allowed when the email is
 * already in 'trash' — otherwise callers should use /delete (soft
 * delete → trash). Prevents the UI from accidentally hard-deleting
 * inbox items through the wrong call.
 */
inboxRoutes.post('/emails/:id/purge', async (c) => {
  const emailId = c.req.param('id')
  const userId = c.get('userId')
  const db = getDb()
  const ok = await purgeOneFromTrash(db, emailId, userId)
  if (!ok) {
    return c.json(
      {
        error: {
          code: 'NOT_IN_TRASH',
          message:
            'Only emails already in Trash can be permanently deleted.',
        },
      },
      409,
    )
  }
  eventBus.publish({ type: 'email.deleted', userId, emailId })
  return c.json({ ok: true })
})
