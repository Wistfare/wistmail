import { and, eq, lt, or, sql } from 'drizzle-orm'
import { emails, sendingLogs, mailboxes } from '@wistmail/db'
import { generateId } from '@wistmail/shared'
import type { Database } from '@wistmail/db'
import { eventBus } from '../events/bus.js'
import { refundSend } from './send-rate-limit.js'

const MAIL_ENGINE_URL = process.env.MAIL_ENGINE_URL || 'http://mail-engine:8025'
const INBOUND_SECRET = process.env.INBOUND_SECRET || ''

/// Email lifecycle status values. Mirrors the column in
/// packages/db/src/schema/emails.ts. Keep in sync with the client
/// types in apps/web (inbox/page.tsx) and apps/mobile.
export const EMAIL_STATUS = {
  /// No outbound dispatch in progress (inbound mail, drafts you are
  /// still typing).
  Idle: 'idle',
  /// Claimed by the dispatcher, waiting on or in flight to mail-engine.
  Sending: 'sending',
  /// Mail-engine accepted; appears in Sent.
  Sent: 'sent',
  /// Mail-engine returned a hard rejection (4xx, recipient bounce,
  /// content rejection). User must edit + retry.
  Failed: 'failed',
  /// Per-user send rate limit blocked the dispatch. The dispatcher
  /// will retry automatically when the window rolls over.
  RateLimited: 'rate_limited',
} as const
export type EmailStatus = (typeof EMAIL_STATUS)[keyof typeof EMAIL_STATUS]

/// Errors returned by the mail-engine that we treat as terminal — no
/// retry, surface to the user. Anything else is retryable (network,
/// 5xx, timeout).
const HARD_FAIL_MARKERS = [
  'recipient',
  'mailbox',
  'invalid address',
  'too large',
  'rejected',
  'spam',
  'authentication',
]

function isHardFailure(err: string | undefined): boolean {
  if (!err) return false
  const lower = err.toLowerCase()
  return HARD_FAIL_MARKERS.some((m) => lower.includes(m))
}

/// Backoff schedule for the dispatcher loop. Linear-then-exponential —
/// quick first retry to ride out transient blips, longer waits to stop
/// hammering a sustained outage.
const RETRY_DELAYS_MS = [1_000, 4_000, 30_000, 5 * 60_000, 60 * 60_000]
export const MAX_SEND_ATTEMPTS = RETRY_DELAYS_MS.length

/// Compute the next eligible attempt time for an email currently in a
/// retryable state. Returns null if we've exhausted retries.
export function nextAttemptAt(attempts: number, base: Date): Date | null {
  if (attempts >= RETRY_DELAYS_MS.length) return null
  return new Date(base.getTime() + RETRY_DELAYS_MS[attempts])
}

/// Emit a lifecycle event to subscribers so the UI can flip the row's
/// status pill without a refetch. Mirror of the existing
/// email.updated event but specifically for send-state transitions.
function publishStatusEvent(
  userId: string,
  emailId: string,
  status: EmailStatus,
  error: string | null,
): void {
  eventBus.publish({
    type: 'email.send_status',
    userId,
    emailId,
    status,
    error,
  })
}

/**
 * EmailSender drives the outbound state machine.
 *
 *     idle ──dispatch()──▶ sending ──┬─ ok ────▶ sent
 *                                    ├─ rate ──▶ rate_limited (auto-retry)
 *                                    └─ fail ──▶ failed (user retry)
 *
 * Every state transition is a conditional UPDATE so two concurrent
 * dispatchers (e.g. compose-send + outbox-tick) can't double-send the
 * same email. The conditional clause is the lock.
 */
export class EmailSender {
  constructor(private db: Database) {}

  /// Atomically claim an email for sending. Returns true if the caller
  /// won the race, false if someone else already moved it past 'idle'
  /// (or it doesn't exist).
  ///
  /// Allowed source states: 'idle', 'rate_limited', 'failed'. We retry
  /// rate-limited automatically; failed is user-initiated.
  async claim(emailId: string): Promise<boolean> {
    const claimed = await this.db
      .update(emails)
      .set({
        status: EMAIL_STATUS.Sending,
        sendError: null,
        lastAttemptAt: new Date(),
        sendAttempts: sql`${emails.sendAttempts} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(emails.id, emailId),
          or(
            eq(emails.status, EMAIL_STATUS.Idle),
            eq(emails.status, EMAIL_STATUS.RateLimited),
            eq(emails.status, EMAIL_STATUS.Failed),
          ),
        ),
      )
      .returning({
        id: emails.id,
        userId: mailboxes.userId,
      })
      // The returning() above can't reach `mailboxes` without a join —
      // we re-query to surface the userId for the WS publish below.
    if (claimed.length === 0) return false

    const userResult = await this.db
      .select({ userId: mailboxes.userId })
      .from(emails)
      .innerJoin(mailboxes, eq(emails.mailboxId, mailboxes.id))
      .where(eq(emails.id, emailId))
      .limit(1)
    if (userResult.length > 0) {
      publishStatusEvent(userResult[0].userId, emailId, EMAIL_STATUS.Sending, null)
    }
    return true
  }

  /// Drive a single send attempt. The email must already be in
  /// 'sending' (claimed by `claim()` above). Persists the resulting
  /// state and emits the corresponding WS event.
  async sendEmail(emailId: string): Promise<{ success: boolean; error?: string; status: EmailStatus }> {
    const emailResult = await this.db.select().from(emails).where(eq(emails.id, emailId)).limit(1)
    if (emailResult.length === 0) {
      return { success: false, error: 'Email not found', status: EMAIL_STATUS.Failed }
    }
    const email = emailResult[0]

    let fromHeader = email.fromAddress
    let userId: string | null = null
    const mailboxResult = await this.db
      .select({ displayName: mailboxes.displayName, userId: mailboxes.userId })
      .from(mailboxes)
      .where(eq(mailboxes.address, email.fromAddress))
      .limit(1)
    if (mailboxResult.length > 0) {
      if (mailboxResult[0].displayName) {
        fromHeader = `"${mailboxResult[0].displayName}" <${email.fromAddress}>`
      }
      userId = mailboxResult[0].userId
    }

    const payload: Record<string, unknown> = {
      from: fromHeader,
      to: email.toAddresses,
      subject: email.subject,
    }
    if (email.cc && email.cc.length > 0) payload.cc = email.cc
    if (email.bcc && email.bcc.length > 0) payload.bcc = email.bcc
    if (email.htmlBody) payload.html = email.htmlBody
    if (email.textBody) payload.text = email.textBody
    if (email.inReplyTo) payload.inReplyTo = email.inReplyTo

    let lastError: string | undefined
    let httpStatus = 0

    try {
      const response = await fetch(`${MAIL_ENGINE_URL}/api/v1/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Inbound-Secret': INBOUND_SECRET,
        },
        body: JSON.stringify(payload),
      })
      httpStatus = response.status
      const data = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) {
        lastError = data.error || `Mail engine error: ${response.status}`
        console.error(`[email-sender] ${emailId} send failed:`, lastError)
      } else {
        console.log(`[email-sender] ${emailId} sent`)
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
      console.error(`[email-sender] ${emailId} fetch failed:`, lastError)
    }

    await this.db.insert(sendingLogs).values({
      id: generateId('slog'),
      emailId,
      status: lastError ? 'failed' : 'sent',
      metadata: lastError ? { error: lastError, httpStatus } : { httpStatus },
      createdAt: new Date(),
    })

    if (!lastError) {
      await this.db
        .update(emails)
        .set({
          folder: 'sent',
          isDraft: false,
          status: EMAIL_STATUS.Sent,
          sendError: null,
          updatedAt: new Date(),
        })
        .where(eq(emails.id, emailId))
      if (userId) {
        publishStatusEvent(userId, emailId, EMAIL_STATUS.Sent, null)
      }
      return { success: true, status: EMAIL_STATUS.Sent }
    }

    // Failure path — classify, persist, possibly schedule a retry.
    const hard = isHardFailure(lastError) || (httpStatus >= 400 && httpStatus < 500 && httpStatus !== 429)
    const exhaustedRetries = (email.sendAttempts ?? 0) >= MAX_SEND_ATTEMPTS
    const finalState: EmailStatus = hard || exhaustedRetries
      ? EMAIL_STATUS.Failed
      : EMAIL_STATUS.RateLimited

    await this.db
      .update(emails)
      .set({
        status: finalState,
        sendError: lastError,
        updatedAt: new Date(),
      })
      .where(eq(emails.id, emailId))

    if (userId) {
      publishStatusEvent(userId, emailId, finalState, lastError)
      // Refund the rate-limit slot so transient failures don't burn
      // the user's hourly budget. Hard failures keep the slot consumed
      // — the message did exit the user's intent to send.
      if (!hard) await refundSend(userId)
    }

    return { success: false, error: lastError, status: finalState }
  }

  /// Find emails ready for an automatic retry. Used by the background
  /// dispatcher tick (started in apps/api/src/index.ts).
  ///
  /// `now` is parameterized for tests.
  async listRetryable(now: Date = new Date(), limit = 50) {
    // For each retryable email, the next eligible attempt time is
    // last_attempt_at + RETRY_DELAYS_MS[attempts - 1]. We can't compute
    // this inline easily in SQL, so we filter on the worst case
    // (oldest possible retry window) here and the caller re-checks
    // per-row.
    const cutoff = new Date(now.getTime() - RETRY_DELAYS_MS[0])
    return this.db
      .select({
        id: emails.id,
        attempts: emails.sendAttempts,
        lastAttemptAt: emails.lastAttemptAt,
        status: emails.status,
      })
      .from(emails)
      .where(
        and(
          or(
            eq(emails.status, EMAIL_STATUS.RateLimited),
            // Failed emails are user-retried only — exclude here.
          ),
          lt(emails.lastAttemptAt, cutoff),
        ),
      )
      .limit(limit)
  }
}
