/**
 * One processor per BullMQ job name. Each processor:
 *  - loads the email/user context
 *  - calls the matching @wistmail/ai job function
 *  - writes the result back to Postgres
 *  - returns a small summary BullMQ logs to the console
 *
 * Errors propagate to BullMQ which retries with exponential backoff
 * per the queue config in worker.ts.
 */

import { and, desc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm'
import { Queue, type Job } from 'bullmq'
import {
  autoLabel,
  classifyNeedsReply,
  draftReply,
  summarizeEmail,
  todayDigest,
  type AiProvider,
} from '@wistmail/ai'
import {
  calendarEvents,
  emailLabels,
  emailReplySuggestions,
  emails,
  mailboxes,
  projectTasks,
  projects,
  todayDigests,
  users,
  type Database,
} from '@wistmail/db'
import IORedis from 'ioredis'
import { loadEmailContext } from './email-context.js'
import {
  JOB_NAMES,
  type AutoLabelJob,
  type ClassifyNeedsReplyJob,
  type DraftReplyJob,
  type IngestEmailJob,
  type SummarizeJob,
  type TodayDigestJob,
} from '@wistmail/ai'

export interface ProcessorDeps {
  db: Database
  provider: AiProvider
  model: string
  /// The same queue the worker is consuming from — used by ingest-email
  /// to enqueue the per-job fan-out.
  queue: Queue
  /// Redis publisher for cache-bust messages. The API subscribes and
  /// invalidates the user's hot reads when our writes land.
  publisher: IORedis
}

const CACHE_BUST_CHANNEL = 'wm:cache-bust'
/// Mirror the constant in `apps/api/src/lib/notification-update-bus.ts`.
/// We publish here; the API subscribes there and converts it to a
/// follow-up FCM push.
const NOTIFICATION_UPDATE_CHANNEL = 'wm:notification-update'

async function bust(deps: ProcessorDeps, userId: string, scope?: string): Promise<void> {
  try {
    await deps.publisher.publish(CACHE_BUST_CHANNEL, JSON.stringify({ userId, scope }))
  } catch (err) {
    console.warn('[ai-worker] cache bust failed:', (err as Error).message)
  }
}

async function userIdForEmail(deps: ProcessorDeps, emailId: string): Promise<string | null> {
  const rows = await deps.db
    .select({ userId: mailboxes.userId })
    .from(emails)
    .innerJoin(mailboxes, eq(mailboxes.id, emails.mailboxId))
    .where(eq(emails.id, emailId))
    .limit(1)
  return rows[0]?.userId ?? null
}

export async function processIngestEmail(
  deps: ProcessorDeps,
  job: Job<IngestEmailJob>,
): Promise<{ scheduled: string[] }> {
  const { emailId, force } = job.data
  if (!force) {
    const row = await deps.db
      .select({ aiProcessedAt: emails.aiProcessedAt })
      .from(emails)
      .where(eq(emails.id, emailId))
      .limit(1)
    if (row[0]?.aiProcessedAt) {
      return { scheduled: [] }
    }
  }
  const opts = { removeOnComplete: 100, removeOnFail: 200, attempts: 2 }
  const names = [
    JOB_NAMES.classifyNeedsReply,
    JOB_NAMES.summarize,
    JOB_NAMES.autoLabel,
    JOB_NAMES.draftReply,
  ]
  for (const name of names) {
    await deps.queue.add(name, { emailId }, opts)
  }
  await deps.db
    .update(emails)
    .set({ aiProcessedAt: new Date() })
    .where(eq(emails.id, emailId))
  return { scheduled: names }
}

export async function processClassifyNeedsReply(
  deps: ProcessorDeps,
  job: Job<ClassifyNeedsReplyJob>,
) {
  const ctx = await loadEmailContext(deps.db, job.data.emailId)
  if (!ctx) return { skipped: 'email-deleted' }

  const result = await classifyNeedsReply(deps.provider, deps.model, {
    fromAddress: ctx.email.fromAddress,
    subject: ctx.email.subject,
    body: ctx.email.body,
  })

  await deps.db
    .update(emails)
    .set({ needsReply: result.needsReply, needsReplyReason: result.reason })
    .where(eq(emails.id, ctx.email.id))

  // Intra-day priority merge. If the email is urgent enough, splice
  // it into today's existing digest priorities by urgency. We never
  // re-run the heavier today-digest job for new email — the morning
  // run picked the briefing + focus blocks from the morning state,
  // and only the priorities list needs to react to the day's traffic.
  let mergeResult: 'merged' | 'skipped-no-digest' | 'skipped-low-urgency' | 'skipped-not-needed' =
    'skipped-low-urgency'
  if (result.needsReply && result.urgency >= 0.6) {
    mergeResult = await mergeEmailIntoDigest(deps, {
      userId: ctx.userId,
      emailId: ctx.email.id,
      reason: result.reason,
      urgency: result.urgency,
    })
  } else if (!result.needsReply) {
    mergeResult = 'skipped-not-needed'
  }

  await bust(deps, ctx.userId, 'today')
  return { needsReply: result.needsReply, urgency: result.urgency, merge: mergeResult }
}

/**
 * Splice a single new email into the user's existing today_digests row,
 * sorted by urgency, capped at 5. No-op if the user has no digest yet
 * (they'll see the email in the live "needs reply" list anyway).
 *
 * Cheap: one SELECT, optional one UPSERT, no model call. Replaces the
 * earlier "re-run the full digest on every email.new" idea — that was
 * 30s+ of CPU per active email and lost the briefing/focus blocks the
 * morning run already curated.
 */
async function mergeEmailIntoDigest(
  deps: ProcessorDeps,
  email: { userId: string; emailId: string; reason: string; urgency: number },
): Promise<'merged' | 'skipped-no-digest' | 'skipped-not-needed'> {
  const rows = await deps.db
    .select({ content: todayDigests.content, generatedAt: todayDigests.generatedAt })
    .from(todayDigests)
    .where(eq(todayDigests.userId, email.userId))
    .limit(1)
  const existing = rows[0]
  if (!existing) return 'skipped-no-digest'

  // Existing digests written before urgency landed have no urgency
  // field on their priorities — backfill 0.5 so the sort doesn't NaN
  // them off the list. Tomorrow morning's digest will produce real
  // scores, so this only matters today.
  const current = (existing.content.priorities ?? []).map((p) => ({
    ...p,
    urgency: typeof p.urgency === 'number' ? p.urgency : 0.5,
  }))
  // De-dupe by id+kind in case classify ran more than once on the
  // same email (re-ingest, manual force, etc.).
  const without = current.filter((p) => !(p.kind === 'email' && p.id === email.emailId))
  const next = [
    ...without,
    { kind: 'email' as const, id: email.emailId, reason: email.reason, urgency: email.urgency },
  ]
    .sort((a, b) => b.urgency - a.urgency)
    .slice(0, 5)

  // Skip the write when the merge result is identical to current — saves a
  // pointless cache bust + WS broadcast.
  if (
    next.length === current.length &&
    next.every(
      (p, i) =>
        p.kind === current[i]!.kind &&
        p.id === current[i]!.id &&
        p.urgency === current[i]!.urgency,
    )
  ) {
    return 'skipped-not-needed'
  }

  await deps.db
    .update(todayDigests)
    .set({ content: { ...existing.content, priorities: next } })
    .where(eq(todayDigests.userId, email.userId))
  return 'merged'
}

export async function processSummarize(deps: ProcessorDeps, job: Job<SummarizeJob>) {
  const ctx = await loadEmailContext(deps.db, job.data.emailId)
  if (!ctx) return { skipped: 'email-deleted' }
  const result = await summarizeEmail(deps.provider, deps.model, {
    subject: ctx.email.subject,
    body: ctx.email.body,
  })
  await deps.db
    .update(emails)
    .set({ autoSummary: result.summary })
    .where(eq(emails.id, ctx.email.id))
  await bust(deps, ctx.userId, 'unified-inbox')
  return { length: result.summary.length }
}

export async function processAutoLabel(deps: ProcessorDeps, job: Job<AutoLabelJob>) {
  const ctx = await loadEmailContext(deps.db, job.data.emailId)
  if (!ctx) return { skipped: 'email-deleted' }
  const result = await autoLabel(deps.provider, deps.model, {
    fromAddress: ctx.email.fromAddress,
    subject: ctx.email.subject,
    body: ctx.email.body,
    availableLabels: ctx.availableLabels,
  })
  // Apply confidence floor and de-dupe against existing AI rows.
  const picks = result.labels.filter((l) => l.confidence >= 0.6)
  if (picks.length === 0) return { applied: 0 }

  // Replace AI-source rows for this email; preserve user-applied ones.
  await deps.db.transaction(async (tx) => {
    await tx
      .delete(emailLabels)
      .where(and(eq(emailLabels.emailId, ctx.email.id), eq(emailLabels.source, 'ai')))
    if (picks.length > 0) {
      await tx
        .insert(emailLabels)
        .values(
          picks.map((p) => ({
            emailId: ctx.email.id,
            labelId: p.id,
            source: 'ai',
            confidence: p.confidence,
          })),
        )
        .onConflictDoNothing()
    }
  })
  return { applied: picks.length }
}

export async function processDraftReply(deps: ProcessorDeps, job: Job<DraftReplyJob>) {
  const ctx = await loadEmailContext(deps.db, job.data.emailId)
  if (!ctx) return { skipped: 'email-deleted' }
  const result = await draftReply(deps.provider, deps.model, {
    fromName: null,
    fromAddress: ctx.email.fromAddress,
    subject: ctx.email.subject,
    body: ctx.email.body,
    userDisplayName: ctx.userDisplayName,
  })
  const drafts = result.drafts.filter((d) => d.score >= 0.4)

  // Capture the inserted rows so the follow-up notification push
  // below carries the same ids the in-app `ReplySuggestionStrip`
  // uses — tapping a chip in the notification then deep-links to
  // a compose pre-populated from the same suggestion record.
  const insertedRows: Array<{ id: string; tone: string; body: string }> = []
  await deps.db.transaction(async (tx) => {
    await tx.delete(emailReplySuggestions).where(eq(emailReplySuggestions.emailId, ctx.email.id))
    if (drafts.length > 0) {
      const values = drafts.map((d) => ({
        id: makeId(),
        emailId: ctx.email.id,
        tone: d.tone,
        body: d.body,
        score: d.score,
      }))
      await tx.insert(emailReplySuggestions).values(values)
      for (const v of values) {
        insertedRows.push({ id: v.id, tone: v.tone, body: v.body })
      }
    }
  })

  // Tell the API to fire a follow-up FCM push so the device's email
  // notification gets the suggestion chips. Best-effort and detached:
  // if Redis or FCM is down, the in-app strip still shows the
  // suggestions on next thread open, just not in the notification.
  if (insertedRows.length > 0) {
    const ownerId = await userIdForEmail(deps, ctx.email.id)
    if (ownerId) {
      try {
        await deps.publisher.publish(
          NOTIFICATION_UPDATE_CHANNEL,
          JSON.stringify({
            type: 'email.suggestions.ready',
            userId: ownerId,
            emailId: ctx.email.id,
            // Cap to top 3 — matches the in-app strip + keeps the
            // FCM data payload comfortably under the 4KB limit even
            // for chatty drafts.
            suggestions: insertedRows.slice(0, 3),
          }),
        )
      } catch (err) {
        console.warn(
          '[ai-worker] notification-update publish failed:',
          (err as Error).message,
        )
      }
    }
  }

  return { drafts: drafts.length }
}

export async function processTodayDigest(deps: ProcessorDeps, job: Job<TodayDigestJob>) {
  const userId = job.data.userId
  const now = new Date()
  const dayStart = new Date(now)
  dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(dayStart)
  dayEnd.setDate(dayEnd.getDate() + 1)

  const userRow = await deps.db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  if (!userRow[0]) return { skipped: 'user-not-found' }

  const userMailboxes = await deps.db
    .select({ id: mailboxes.id })
    .from(mailboxes)
    .where(eq(mailboxes.userId, userId))
  const mailboxIds = userMailboxes.map((m) => m.id)

  const [pendingEmails, todayEvents, openTasks] = await Promise.all([
    mailboxIds.length === 0
      ? []
      : deps.db
          .select({
            id: emails.id,
            fromAddress: emails.fromAddress,
            subject: emails.subject,
            snippet: sql<string>`coalesce(${emails.autoSummary}, left(coalesce(${emails.textBody}, ''), 200))`,
            needsReply: emails.needsReply,
          })
          .from(emails)
          .where(
            and(
              // inArray binds the JS array as a parameterised list.
              // Earlier this was a raw `sql\`= ANY(${arr})\`` which
              // postgres-js expanded to N positional params instead
              // of one array param — every digest job died with
              // "Failed query".
              inArray(emails.mailboxId, mailboxIds),
              eq(emails.isRead, false),
              eq(emails.folder, 'inbox'),
            ),
          )
          .orderBy(desc(emails.createdAt))
          .limit(20),
    deps.db
      .select({
        id: calendarEvents.id,
        title: calendarEvents.title,
        startAt: calendarEvents.startAt,
        endAt: calendarEvents.endAt,
      })
      .from(calendarEvents)
      .where(
        and(
          eq(calendarEvents.userId, userId),
          gte(calendarEvents.startAt, dayStart),
          lte(calendarEvents.startAt, dayEnd),
        ),
      ),
    deps.db
      .select({
        id: projectTasks.id,
        title: projectTasks.title,
        status: projectTasks.status,
        projectName: projects.name,
      })
      .from(projectTasks)
      .innerJoin(projects, eq(projects.id, projectTasks.projectId))
      .where(
        and(
          eq(projects.ownerId, userId),
          sql`${projectTasks.status} <> 'done'`,
        ),
      )
      .limit(15),
  ])

  const result = await todayDigest(deps.provider, deps.model, {
    userDisplayName: userRow[0].name,
    pendingEmails: pendingEmails.map((e) => ({
      id: e.id,
      fromAddress: e.fromAddress,
      subject: e.subject,
      snippet: (e.snippet ?? '').slice(0, 200),
      needsReply: e.needsReply,
    })),
    todayEvents: todayEvents.map((e) => ({
      id: e.id,
      title: e.title,
      startAt: e.startAt.toISOString(),
      endAt: e.endAt.toISOString(),
    })),
    openTasks: openTasks.map((t) => ({
      id: t.id,
      title: t.title,
      projectName: t.projectName,
      status: t.status,
    })),
  })

  await deps.db
    .insert(todayDigests)
    .values({ userId, content: result, generatedAt: new Date() })
    .onConflictDoUpdate({
      target: todayDigests.userId,
      set: { content: result, generatedAt: new Date() },
    })
  await bust(deps, userId, 'today')
  return { priorities: result.priorities.length }
}

/**
 * Iterate the user set and enqueue one digest job per active user.
 * Called from a cron tick. Safe to run more than once a day — the
 * digest table is keyed by userId so re-runs overwrite cleanly.
 */
export async function enqueueAllDigests(deps: ProcessorDeps): Promise<number> {
  const rows = await deps.db.select({ id: users.id }).from(users)
  for (const r of rows) {
    await deps.queue.add(JOB_NAMES.todayDigest, { userId: r.id }, {
      removeOnComplete: 50,
      removeOnFail: 100,
      attempts: 1,
    })
  }
  return rows.length
}

/// 16-byte url-safe id. Collision odds are well below the rate of email
/// arrival on this server, so a per-row uuid pkg isn't worth the dep.
function makeId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// Imports referenced only by the digest path; suppress lint by touching here.
void isNull
