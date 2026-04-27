/**
 * Backfill: enqueue extract-meeting for every email that hasn't been
 * processed yet. The worker writes meeting_extracted_at on every row
 * (success or skip) so this is idempotent — a re-run only touches
 * still-NULL rows.
 *
 *   pnpm --filter @wistmail/api backfill-extract-meeting
 *   BACKFILL_DRY_RUN=1 ...        (count only)
 *   BACKFILL_USER_EMAIL=foo@x.com ...   (limit to a single user)
 */

import { fileURLToPath } from 'node:url'
import { Queue } from 'bullmq'
import IORedis from 'ioredis'
import { and, asc, eq, isNull, sql } from 'drizzle-orm'
import { AI_QUEUE, JOB_NAMES } from '@wistmail/ai'
import { emails, mailboxes, users } from '@wistmail/db'
import { getDb } from '../lib/db.js'

const DRY_RUN = process.env.BACKFILL_DRY_RUN === '1'
const ONLY_USER_EMAIL = process.env.BACKFILL_USER_EMAIL ?? null

async function run(): Promise<void> {
  const db = getDb()

  let userFilter = sql`TRUE`
  if (ONLY_USER_EMAIL) {
    const u = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, ONLY_USER_EMAIL.toLowerCase()))
      .limit(1)
    if (!u[0]) {
      console.log(`[backfill-extract] no user with email ${ONLY_USER_EMAIL} — exiting`)
      return
    }
    userFilter = sql`${mailboxes.userId} = ${u[0].id}`
  }

  const rows = await db
    .select({ id: emails.id })
    .from(emails)
    .innerJoin(mailboxes, eq(mailboxes.id, emails.mailboxId))
    .where(and(isNull(emails.meetingExtractedAt), userFilter))
    .orderBy(asc(emails.createdAt))

  console.log(
    `[backfill-extract] ${rows.length} emails without a meeting-extraction marker${ONLY_USER_EMAIL ? ` (user=${ONLY_USER_EMAIL})` : ''}`,
  )
  if (DRY_RUN || rows.length === 0) {
    console.log(`[backfill-extract] done (${DRY_RUN ? 'dry run' : 'nothing to do'})`)
    return
  }

  const redisUrl = process.env.REDIS_URL
  if (!redisUrl) throw new Error('REDIS_URL not set')
  const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null })
  const queue = new Queue(AI_QUEUE, { connection })

  let enqueued = 0
  for (const row of rows) {
    await queue.add(
      JOB_NAMES.extractMeeting,
      { emailId: row.id },
      { attempts: 1, removeOnComplete: 200, removeOnFail: 200 },
    )
    enqueued++
  }
  await queue.close()
  await connection.quit()
  console.log(`[backfill-extract] enqueued ${enqueued}`)
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) {
  run()
    .catch((err) => {
      console.error('[backfill-extract] failed', err)
      process.exit(1)
    })
    .then(() => process.exit(0))
}
