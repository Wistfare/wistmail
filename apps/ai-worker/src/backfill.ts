/**
 * One-shot backfill: walk every email that doesn't have ai_processed_at
 * set and enqueue an ingest-email job for it. Use this once after
 * deploying the AI worker over an existing inbox.
 *
 *   pnpm --filter @wistmail/ai-worker backfill
 *
 * Environment:
 *   DATABASE_URL, REDIS_URL — same as the worker.
 *   BACKFILL_BATCH_SIZE     — rows per page (default 500).
 *   BACKFILL_DRY_RUN=1      — print counts, enqueue nothing.
 *
 * The backfill enqueues; it doesn't generate. The worker drains the
 * queue at its own pace (one job at a time, ~10s for classify/label,
 * ~30s for a draft). For 5k unprocessed emails on E4B that's roughly
 * a half-day of background work — fine to leave running overnight.
 *
 * Idempotency: jobs check `aiProcessedAt` before fanning out, so re-
 * running this script over partially-processed inboxes is safe — only
 * the still-unprocessed rows get re-enqueued.
 */

import { Queue } from 'bullmq'
import { asc, isNull, sql } from 'drizzle-orm'
import IORedis from 'ioredis'
import { AI_QUEUE, JOB_NAMES } from '@wistmail/ai'
import { createDb, emails } from '@wistmail/db'
import { loadConfig } from './config.js'

async function main() {
  const config = loadConfig()
  const db = createDb(config.databaseUrl)
  const connection = new IORedis(config.redisUrl, { maxRetriesPerRequest: null })
  const queue = new Queue(AI_QUEUE, { connection })

  const batchSize = Number(process.env.BACKFILL_BATCH_SIZE ?? '500')
  const dryRun = process.env.BACKFILL_DRY_RUN === '1'

  // Total count up front so the operator knows how big the job is.
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(emails)
    .where(isNull(emails.aiProcessedAt))
  console.log(`[backfill] ${total} emails without ai_processed_at${dryRun ? ' (dry run)' : ''}`)

  if (total === 0) {
    await queue.close()
    await connection.quit()
    return
  }

  // Page through by created_at — the partial index emails_ai_unprocessed_idx
  // makes this an index-only scan.
  let scanned = 0
  let lastCreatedAt = new Date(0)
  while (scanned < total) {
    const rows = await db
      .select({ id: emails.id, createdAt: emails.createdAt })
      .from(emails)
      .where(
        sql`${emails.aiProcessedAt} IS NULL AND ${emails.createdAt} > ${lastCreatedAt.toISOString()}`,
      )
      .orderBy(asc(emails.createdAt))
      .limit(batchSize)
    if (rows.length === 0) break

    if (!dryRun) {
      await queue.addBulk(
        rows.map((r) => ({
          name: JOB_NAMES.ingestEmail,
          data: { emailId: r.id },
          opts: { attempts: 2, removeOnComplete: 200, removeOnFail: 200 },
        })),
      )
    }
    scanned += rows.length
    lastCreatedAt = rows[rows.length - 1]!.createdAt
    console.log(`[backfill] enqueued ${scanned}/${total} (last ${lastCreatedAt.toISOString()})`)
  }

  await queue.close()
  await connection.quit()
  console.log('[backfill] done')
}

main().catch((err) => {
  console.error('[backfill] failed', err)
  process.exit(1)
})
