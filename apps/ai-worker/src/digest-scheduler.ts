/**
 * Per-user, timezone-aware digest scheduling.
 *
 * Every TICK_MS the scheduler reads the user list (with each user's
 * stored IANA timezone) and enqueues a today-digest job for every
 * user whose **local** wall-clock time falls inside the digest window
 * AND who hasn't received a digest in the last DIGEST_FRESH_MS.
 *
 * The previous implementation fired off one cron-style tick when the
 * server's UTC hour hit 4 — useless once you have users in multiple
 * timezones. With this scheduler each user gets their briefing at the
 * start of their own local day, regardless of where the server lives.
 *
 * Idempotency:
 *   - The enqueue uses a deterministic jobId (`digest:{userId}:{YYYY-MM-DD-in-user-tz}`)
 *     so multiple ticks inside the window collapse to one job.
 *   - The fresh-window check filters out users who already have a
 *     digest from today; protects against re-running a digest just
 *     because the dedup key cleared (e.g. after a Redis flush).
 */

import { Queue } from 'bullmq'
import { users, todayDigests, type Database } from '@wistmail/db'
import { eq } from 'drizzle-orm'
import { JOB_NAMES } from '@wistmail/ai'

const TICK_MS = 5 * 60 * 1000
/// Window inside which a user's local hour fires the digest. We
/// generate at the start of the user's day (00:00–01:00 local) — the
/// API's 12h staleness fallback re-generates on first open if any
/// new email arrives between then and the user actually looking, so
/// firing earlier doesn't cost freshness, and "the day starts at
/// midnight" is a less arbitrary contract than "we pick 04:00 because
/// morning". The 1-hour window gives the 5-min ticker enough slack
/// that we never miss a user across the date roll-over.
const WINDOW_HOUR_START = 0
const WINDOW_HOUR_END = 1
/// A digest from less than this far back counts as "already done today".
/// 22h, not 24h, so the next-morning fire isn't shut out by yesterday's
/// late evening regen.
const DIGEST_FRESH_MS = 22 * 60 * 60 * 1000

export interface SchedulerDeps {
  db: Database
  queue: Queue
}

/// Local wall-clock hour for the given IANA TZ. Falls back to 99
/// (no-window) on unknown TZs so a malformed user row doesn't fire
/// a digest at the wrong time.
export function localHour(now: Date, tz: string): number {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: 'numeric',
      hour12: false,
    })
    const parts = fmt.formatToParts(now)
    const h = parts.find((p) => p.type === 'hour')?.value
    return h ? parseInt(h, 10) : 99
  } catch {
    return 99
  }
}

/// Local YYYY-MM-DD for the given TZ. Used as the per-day dedup key.
export function localDay(now: Date, tz: string): string {
  try {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    return fmt.format(now)
  } catch {
    return now.toISOString().slice(0, 10)
  }
}

export async function tickDigestSchedule(
  deps: SchedulerDeps,
  now: Date = new Date(),
): Promise<{ scanned: number; enqueued: number }> {
  const userRows = await deps.db
    .select({ id: users.id, timezone: users.timezone })
    .from(users)

  let enqueued = 0
  for (const u of userRows) {
    const tz = u.timezone || 'UTC'
    const h = localHour(now, tz)
    if (h < WINDOW_HOUR_START || h >= WINDOW_HOUR_END) continue

    const existing = await deps.db
      .select({ generatedAt: todayDigests.generatedAt })
      .from(todayDigests)
      .where(eq(todayDigests.userId, u.id))
      .limit(1)
    const last = existing[0]?.generatedAt
    if (last && now.getTime() - last.getTime() < DIGEST_FRESH_MS) continue

    const day = localDay(now, tz)
    try {
      await deps.queue.add(
        JOB_NAMES.todayDigest,
        { userId: u.id },
        {
          // BullMQ rejects ':' in custom jobIds. Use '-' as separator.
          jobId: `digest-${u.id}-${day}`,
          attempts: 1,
          removeOnComplete: 50,
          removeOnFail: 50,
        },
      )
      enqueued++
    } catch (err) {
      // Real error (not just dedup) — log it so we don't silently
      // drop digest jobs the way we did pre-fix when the colon
      // separator made every add throw.
      const msg = (err as Error).message ?? ''
      if (!/already exists/i.test(msg)) {
        console.warn(`[ai-worker] digest enqueue failed for ${u.id}: ${msg}`)
      }
    }
  }
  return { scanned: userRows.length, enqueued }
}

export function startDigestScheduler(deps: SchedulerDeps): NodeJS.Timeout {
  // Run one tick immediately so an operator restarting the worker
  // mid-window doesn't have to wait TICK_MS for the first fire.
  void tickDigestSchedule(deps).catch((err) => {
    console.error('[ai-worker] digest tick failed (initial)', err)
  })
  return setInterval(async () => {
    try {
      const { scanned, enqueued } = await tickDigestSchedule(deps)
      if (enqueued > 0) {
        console.log(`[ai-worker] digest tick — scanned ${scanned}, enqueued ${enqueued}`)
      }
    } catch (err) {
      console.error('[ai-worker] digest tick failed', err)
    }
  }, TICK_MS)
}
