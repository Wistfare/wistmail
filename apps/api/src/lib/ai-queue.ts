/**
 * Lazy singleton BullMQ queue for AI work. The API only ever enqueues —
 * actual processing happens in the @wistmail/ai-worker container.
 *
 * Imported by services/email-receiver.ts (one job per inbound email)
 * and routes/today.ts (manual "regenerate digest" path). Stays a no-op
 * when REDIS_URL is unset so dev workflows that don't touch AI keep
 * working.
 */

import { Queue } from 'bullmq'
import { AI_QUEUE, JOB_NAMES } from '@wistmail/ai'
import { getRedis } from './redis.js'

let cached: Queue | null | undefined = undefined

function getQueue(): Queue | null {
  if (cached !== undefined) return cached
  const redis = getRedis()
  if (!redis) {
    cached = null
    return null
  }
  cached = new Queue(AI_QUEUE, { connection: redis })
  return cached
}

export async function enqueueIngestEmail(emailId: string): Promise<void> {
  const queue = getQueue()
  if (!queue) return
  await queue.add(
    JOB_NAMES.ingestEmail,
    { emailId },
    {
      // The worker fans out to per-email jobs; the ingest job itself is
      // cheap, so a single retry is enough.
      attempts: 2,
      removeOnComplete: 200,
      removeOnFail: 200,
    },
  )
}

export async function enqueueTodayDigest(userId: string): Promise<void> {
  const queue = getQueue()
  if (!queue) return
  // Deterministic jobId per user → BullMQ dedups. Without this, every
  // /today fetch from the same user re-enqueues the digest because the
  // stored row is stale-or-missing (chicken-and-egg). Keying on date
  // means we get one digest job per user per day even if /today is
  // hammered, with a fresh job allowed once the date rolls over.
  const dayKey = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
  await queue.add(JOB_NAMES.todayDigest, { userId }, {
    // BullMQ rejects ':' in custom jobIds (it's the internal Redis
    // key separator). Use '-'.
    jobId: `digest-${userId}-${dayKey}`,
    attempts: 1,
    removeOnComplete: 50,
    removeOnFail: 50,
  })
}
