/// Background dispatcher that retries `rate_limited` sends after their
/// backoff window has elapsed. Runs as a singleton in-process — the
/// claim() in EmailSender uses a conditional UPDATE so multiple
/// instances are safe (only one will win the row).
///
/// Failed sends are NOT auto-retried; the user must explicitly hit the
/// /dispatch endpoint after fixing whatever caused the rejection.

import { and, eq, lt, lte, isNotNull, or } from 'drizzle-orm'
import { emails, mailboxes } from '@wistmail/db'
import type { Database } from '@wistmail/db'
import { EmailSender, EMAIL_STATUS, MAX_SEND_ATTEMPTS, nextAttemptAt } from './email-sender.js'
import { checkAndReserveSend, refundSend } from './send-rate-limit.js'

const TICK_INTERVAL_MS = parseInt(process.env.SEND_DISPATCHER_TICK_MS || '15000', 10)
const TICK_BATCH_SIZE = parseInt(process.env.SEND_DISPATCHER_BATCH || '20', 10)

let timer: NodeJS.Timeout | null = null
let running = false

export function startSendDispatcher(db: Database): void {
  if (timer) return
  console.log(`[send-dispatcher] tick every ${TICK_INTERVAL_MS}ms, batch ${TICK_BATCH_SIZE}`)
  // Fire one immediately so the queue drains on boot, then schedule.
  void tick(db).catch((err) => console.error('[send-dispatcher] initial tick failed:', err))
  timer = setInterval(() => {
    void tick(db).catch((err) => console.error('[send-dispatcher] tick failed:', err))
  }, TICK_INTERVAL_MS)
  // Don't keep the event loop alive just for this — the HTTP server
  // is the lifecycle anchor.
  if (typeof timer.unref === 'function') timer.unref()
}

export function stopSendDispatcher(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

export async function tick(db: Database): Promise<void> {
  if (running) return
  running = true
  try {
    const now = new Date()
    const candidates = await db
      .select({
        id: emails.id,
        attempts: emails.sendAttempts,
        lastAttemptAt: emails.lastAttemptAt,
        userId: mailboxes.userId,
      })
      .from(emails)
      .innerJoin(mailboxes, eq(emails.mailboxId, mailboxes.id))
      .where(
        and(
          eq(emails.status, EMAIL_STATUS.RateLimited),
          isNotNull(emails.lastAttemptAt),
          // Only consider rows where lastAttemptAt is at least the
          // shortest backoff ago — eliminates rows we definitely
          // shouldn't retry yet without per-row math in SQL.
          lt(emails.lastAttemptAt, new Date(now.getTime() - 1_000)),
        ),
      )
      .limit(TICK_BATCH_SIZE)

    // Scheduled-send candidates. The user picked a future send time
    // (schedule send in compose), we persisted the row with
    // status='idle' + scheduledAt=T. Once T <= now we claim + send
    // through the same pipeline rate_limited rows use.
    const scheduled = await db
      .select({
        id: emails.id,
        attempts: emails.sendAttempts,
        lastAttemptAt: emails.lastAttemptAt,
        userId: mailboxes.userId,
      })
      .from(emails)
      .innerJoin(mailboxes, eq(emails.mailboxId, mailboxes.id))
      .where(
        and(
          eq(emails.status, EMAIL_STATUS.Idle),
          eq(emails.isDraft, false),
          isNotNull(emails.scheduledAt),
          lte(emails.scheduledAt, now),
        ),
      )
      .limit(TICK_BATCH_SIZE)

    const allCandidates = [...candidates, ...scheduled]
    if (allCandidates.length === 0) return

    const sender = new EmailSender(db)
    // Rate-limited rows live in `candidates` above; scheduled rows in
    // `scheduled`. We track the set via identity to skip the backoff
    // check for scheduled rows — they have no lastAttemptAt, and
    // their due moment is already encoded in scheduledAt which the
    // SELECT already filtered on.
    const scheduledIds = new Set(scheduled.map((r) => r.id))
    for (const row of allCandidates) {
      const isScheduled = scheduledIds.has(row.id)
      if (!isScheduled) {
        // Per-row backoff check — only for retry candidates.
        if (row.attempts >= MAX_SEND_ATTEMPTS) continue
        const dueAt = nextAttemptAt(row.attempts - 1, row.lastAttemptAt!)
        if (!dueAt || dueAt > now) continue
      }

      // Re-check the rate limit before claiming so we don't burn an
      // attempt just to fail at the limiter again. If still blocked,
      // the row stays in rate_limited and we'll re-examine next tick.
      const rate = await checkAndReserveSend(row.userId)
      if (!rate.allowed) continue

      const claimed = await sender.claim(row.id)
      if (!claimed) {
        // Lost the race to another worker / user retry — refund our slot.
        await refundSend(row.userId)
        continue
      }

      // Fire-and-forget — sender records its own state transitions.
      // We don't await so a single slow recipient doesn't stall the tick.
      sender.sendEmail(row.id).catch(async (err) => {
        console.error(`[send-dispatcher] sendEmail threw for ${row.id}:`, err)
        await refundSend(row.userId)
      })
    }
  } finally {
    running = false
  }
}

// Suppress unused-import warnings for `or` — kept for future expansion
// when we automatically retry transient failures.
void or
