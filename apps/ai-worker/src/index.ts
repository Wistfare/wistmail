/**
 * AI worker entrypoint. Boots one BullMQ worker that handles every AI
 * job type, plus a node-level interval for the daily digest fan-out
 * (cheaper than dragging in an extra cron lib for one tick).
 */

import { Queue, Worker, type Job } from 'bullmq'
import IORedis from 'ioredis'
import { OllamaProvider } from '@wistmail/ai'
import { createDb } from '@wistmail/db'
import { loadConfig } from './config.js'
import {
  enqueueAllDigests,
  processAutoLabel,
  processClassifyNeedsReply,
  processDraftReply,
  processIngestEmail,
  processSummarize,
  processTodayDigest,
  type ProcessorDeps,
} from './processors.js'
import { AI_QUEUE, JOB_NAMES } from '@wistmail/ai'

async function main() {
  const config = loadConfig()
  const db = createDb(config.databaseUrl)
  const provider = new OllamaProvider({ host: config.ollamaHost })
  const connection = new IORedis(config.redisUrl, {
    maxRetriesPerRequest: null,
  })

  const queue = new Queue(AI_QUEUE, { connection })
  // Dedicated publisher connection so the worker's cache-bust messages
  // never block on the BullMQ blocking-fetch socket.
  const publisher = connection.duplicate()
  const deps: ProcessorDeps = { db, provider, model: config.model, queue, publisher }

  const worker = new Worker(
    AI_QUEUE,
    async (job: Job) => {
      switch (job.name) {
        case JOB_NAMES.ingestEmail:
          return processIngestEmail(deps, job as Job)
        case JOB_NAMES.classifyNeedsReply:
          return processClassifyNeedsReply(deps, job as Job)
        case JOB_NAMES.summarize:
          return processSummarize(deps, job as Job)
        case JOB_NAMES.autoLabel:
          return processAutoLabel(deps, job as Job)
        case JOB_NAMES.draftReply:
          return processDraftReply(deps, job as Job)
        case JOB_NAMES.todayDigest:
          return processTodayDigest(deps, job as Job)
        default:
          throw new Error(`Unknown job name: ${job.name}`)
      }
    },
    {
      connection,
      concurrency: config.concurrency,
    },
  )

  worker.on('completed', (job, result) => {
    console.log(`[ai-worker] ${job.name} ${job.id} ok`, result)
  })
  worker.on('failed', (job, err) => {
    console.warn(`[ai-worker] ${job?.name} ${job?.id} failed:`, err.message)
  })

  // Daily 04:00 server-time digest fan-out. Tick every minute and fire
  // when the wall clock crosses 04:00 — replaces a cron dependency.
  let lastDigestDay = -1
  setInterval(async () => {
    const now = new Date()
    if (now.getHours() === 4 && now.getDate() !== lastDigestDay) {
      lastDigestDay = now.getDate()
      try {
        const n = await enqueueAllDigests(deps)
        console.log(`[ai-worker] digest fan-out enqueued ${n} users`)
      } catch (err) {
        console.error('[ai-worker] digest fan-out failed', err)
      }
    }
  }, 60_000)

  console.log(
    `[ai-worker] up — queue=${AI_QUEUE} model=${config.model} concurrency=${config.concurrency}`,
  )

  const shutdown = async () => {
    console.log('[ai-worker] shutting down')
    await worker.close()
    await queue.close()
    await publisher.quit()
    await connection.quit()
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((err) => {
  console.error('[ai-worker] boot failed', err)
  process.exit(1)
})
