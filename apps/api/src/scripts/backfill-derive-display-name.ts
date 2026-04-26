/**
 * Phase 2 backfill: enqueue a derive-display-name job for every
 * unique sender address that still has from_name=NULL on at least
 * one of their emails. The worker's per-address jobId dedups so we
 * never run more than one model call per address regardless of how
 * many emails we ask about.
 *
 *   pnpm --filter @wistmail/api backfill-derive-display-name
 *   BACKFILL_DRY_RUN=1 ...   (count only, enqueue nothing)
 *
 * Run after `backfill-from-name` has already pulled what it can
 * out of the stored RFC-5322 headers — this one targets the rows
 * that genuinely never had a display name, and uses heuristic + AI
 * to fill them in.
 */

import { fileURLToPath } from 'node:url'
import { Queue } from 'bullmq'
import IORedis from 'ioredis'
import { isNotNull, isNull, sql } from 'drizzle-orm'
import { AI_QUEUE, JOB_NAMES } from '@wistmail/ai'
import { emails } from '@wistmail/db'
import { getDb } from '../lib/db.js'

const DRY_RUN = process.env.BACKFILL_DRY_RUN === '1'

async function run(): Promise<void> {
  const db = getDb()

  // One row per unique address. We pick any matching email_id so the
  // worker can write the resolved name back when it's done. (The
  // worker re-checks at write time and skips if the email already
  // has a name from a parallel resolve.)
  const rows = await db
    .selectDistinctOn([emails.fromAddress], {
      address: emails.fromAddress,
      emailId: emails.id,
    })
    .from(emails)
    .where(sql`${isNull(emails.fromName)} AND ${isNotNull(emails.fromAddress)} AND ${emails.fromAddress} <> ''`)
    .orderBy(emails.fromAddress, sql`${emails.createdAt} DESC`)

  console.log(`[backfill-derive] ${rows.length} unique addresses without a name`)
  if (DRY_RUN || rows.length === 0) {
    console.log(`[backfill-derive] done (${DRY_RUN ? 'dry run' : 'nothing to do'})`)
    return
  }

  const redisUrl = process.env.REDIS_URL
  if (!redisUrl) {
    throw new Error('REDIS_URL not set')
  }
  const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null })
  const queue = new Queue(AI_QUEUE, { connection })

  let enqueued = 0
  for (const row of rows) {
    const addr = row.address.toLowerCase()
    try {
      await queue.add(
        JOB_NAMES.deriveDisplayName,
        { address: addr, emailId: row.emailId },
        {
          jobId: `derive:${addr}`,
          attempts: 1,
          removeOnComplete: 200,
          removeOnFail: 200,
        },
      )
      enqueued++
    } catch {
      // jobId collision — already in flight from inbound traffic. Fine.
    }
  }
  await queue.close()
  await connection.quit()
  console.log(`[backfill-derive] enqueued ${enqueued}/${rows.length} unique addresses`)
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) {
  run()
    .catch((err) => {
      console.error('[backfill-derive] failed', err)
      process.exit(1)
    })
    .then(() => process.exit(0))
}
