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
  deriveDisplayName,
  deriveLocalPartName,
  draftReply,
  extractMeeting,
  summarizeEmail,
  todayDigest,
  type AiProvider,
} from '@wistmail/ai'
import {
  calendarEvents,
  emailEventExtractions,
  emailLabels,
  emailReplySuggestions,
  emails,
  mailboxes,
  projectTasks,
  projects,
  senderNames,
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
  type DeriveDisplayNameJob,
  type DraftReplyJob,
  type ExtractMeetingJob,
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
  const names: string[] = [
    JOB_NAMES.classifyNeedsReply,
    JOB_NAMES.summarize,
    JOB_NAMES.autoLabel,
    JOB_NAMES.draftReply,
    JOB_NAMES.extractMeeting,
  ]
  for (const name of names) {
    await deps.queue.add(name, { emailId }, opts)
  }

  // If the inbound row didn't get a from_name from the header, also
  // enqueue a derive-display-name job. Dedup by address so multiple
  // emails from the same nameless sender collapse to one job.
  const emailRow = await deps.db
    .select({ fromName: emails.fromName, fromAddress: emails.fromAddress })
    .from(emails)
    .where(eq(emails.id, emailId))
    .limit(1)
  const row = emailRow[0]
  if (row && (row.fromName === null || row.fromName === '') && row.fromAddress) {
    const addr = row.fromAddress.toLowerCase()
    await deps.queue.add(
      JOB_NAMES.deriveDisplayName,
      { address: addr, emailId },
      {
        ...opts,
        // Per-address dedup — 4 emails from the same unknown sender
        // arriving in a burst collapse to one model call.
        // BullMQ rejects ':' in custom jobIds. Use '-' as separator.
        jobId: `derive-${addr}`,
      },
    )
    names.push(JOB_NAMES.deriveDisplayName)
  }

  await deps.db
    .update(emails)
    .set({ aiProcessedAt: new Date() })
    .where(eq(emails.id, emailId))
  return { scheduled: names }
}

/**
 * Resolve a display name for a sender address. Three-tier cascade:
 *   1. Cache hit on `sender_names`        → use stored name.
 *   2. Heuristic on local-part            → use if confidence ≥ 0.7.
 *   3. AI fallback                        → use if confidence ≥ 0.5.
 *   else: write `unknown` marker so we never re-run for this address.
 *
 * Result is written back to `sender_names` AND, when `emailId` is set,
 * to that email's `from_name` column so the inbox row reflects it.
 */
export async function processDeriveDisplayName(
  deps: ProcessorDeps,
  job: Job<DeriveDisplayNameJob>,
): Promise<{ source: string; name: string; confidence: number | null }> {
  const { address, emailId } = job.data
  const lc = address.toLowerCase()

  // Step 1 — cache.
  const cached = await deps.db
    .select({
      displayName: senderNames.displayName,
      source: senderNames.source,
      confidence: senderNames.confidence,
    })
    .from(senderNames)
    .where(eq(senderNames.address, lc))
    .limit(1)
  if (cached[0]) {
    if (cached[0].source !== 'unknown' && cached[0].displayName) {
      await applyToEmail(deps, emailId, cached[0].displayName)
    }
    return {
      source: `cache-${cached[0].source}`,
      name: cached[0].displayName,
      confidence: cached[0].confidence,
    }
  }

  // Step 2 — heuristic.
  const at = lc.indexOf('@')
  if (at < 1) {
    // Malformed address — write a no-go marker and bail.
    await upsertSenderName(deps, lc, '', 'unknown', 0)
    return { source: 'unknown', name: '', confidence: 0 }
  }
  const localPart = lc.slice(0, at)
  const domain = lc.slice(at + 1)
  const heuristic = deriveLocalPartName(localPart)
  if (heuristic.confidence >= 0.7 && heuristic.name) {
    await upsertSenderName(deps, lc, heuristic.name, 'heuristic', heuristic.confidence)
    await applyToEmail(deps, emailId, heuristic.name)
    return { source: 'heuristic', name: heuristic.name, confidence: heuristic.confidence }
  }
  // High-confidence "this is a role/system address" → store empty
  // marker, skip AI.
  if (heuristic.confidence >= 0.9 && heuristic.name === '') {
    await upsertSenderName(deps, lc, '', 'unknown', heuristic.confidence)
    return { source: 'unknown', name: '', confidence: heuristic.confidence }
  }

  // Step 3 — AI.
  const ai = await deriveDisplayName(deps.provider, deps.model, { localPart, domain })
  if (ai.name && ai.confidence >= 0.5) {
    await upsertSenderName(deps, lc, ai.name, 'ai', ai.confidence)
    await applyToEmail(deps, emailId, ai.name)
    return { source: 'ai', name: ai.name, confidence: ai.confidence }
  }
  // Either model said "this is a role" (name='') or its confidence
  // was too low to commit. Cache 'unknown' to skip future attempts.
  await upsertSenderName(deps, lc, '', 'unknown', ai.confidence)
  return { source: 'unknown', name: ai.name, confidence: ai.confidence }
}

async function upsertSenderName(
  deps: ProcessorDeps,
  address: string,
  displayName: string,
  source: 'header' | 'heuristic' | 'ai' | 'unknown',
  confidence: number | null,
): Promise<void> {
  await deps.db
    .insert(senderNames)
    .values({
      address,
      displayName,
      source,
      confidence,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: senderNames.address,
      set: { displayName, source, confidence, updatedAt: new Date() },
      // Never overwrite a 'header' entry with anything weaker — the
      // human-set From-header name is the ground truth.
      setWhere: sql`${senderNames.source} <> 'header' OR ${source} = 'header'`,
    })
}

async function applyToEmail(
  deps: ProcessorDeps,
  emailId: string | null,
  name: string,
): Promise<void> {
  if (!emailId || !name) return
  await deps.db
    .update(emails)
    .set({ fromName: name })
    .where(and(eq(emails.id, emailId), isNull(emails.fromName)))
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

/**
 * Pull a structured `{startAt, endsAt, location, attendees}` out of an
 * inbound email body and decide what to do with it:
 *
 *   confidence ≥ AUTO_THRESHOLD  → create a calendar event linked to
 *                                  the email; outcome=2.
 *   confidence ≥ CHIP_THRESHOLD  → store the extraction so the mobile
 *                                  thread can show "Add to calendar?";
 *                                  outcome=1.
 *   else                         → store at outcome=0 for analytics
 *                                  and to skip on re-runs.
 *
 * Idempotent: the unique constraint on email_event_extractions.email_id
 * means re-running the job for the same email is a no-op (the second
 * insert is dropped). Re-extraction requires deleting the row first.
 */
const EXTRACT_AUTO_THRESHOLD = 0.85
const EXTRACT_CHIP_THRESHOLD = 0.6

export async function processExtractMeeting(
  deps: ProcessorDeps,
  job: Job<ExtractMeetingJob>,
): Promise<{ outcome: number; createdEventId: string | null; confidence: number }> {
  const { emailId } = job.data

  // Skip if we already extracted from this email — the unique
  // constraint would catch it but we save a model call.
  const existing = await deps.db
    .select({ id: emailEventExtractions.id })
    .from(emailEventExtractions)
    .where(eq(emailEventExtractions.emailId, emailId))
    .limit(1)
  if (existing[0]) {
    return { outcome: -1, createdEventId: null, confidence: 0 }
  }

  const ctx = await loadEmailContext(deps.db, emailId)
  if (!ctx) return { outcome: 0, createdEventId: null, confidence: 0 }

  const senderRow = await deps.db
    .select({
      fromName: emails.fromName,
      sentAt: emails.createdAt,
    })
    .from(emails)
    .where(eq(emails.id, emailId))
    .limit(1)
  const fromName = senderRow[0]?.fromName ?? null
  const sentAt = senderRow[0]?.sentAt ?? new Date()

  const tzRow = await deps.db
    .select({ tz: users.timezone })
    .from(users)
    .where(eq(users.id, ctx.userId))
    .limit(1)
  const recipientTimezone = tzRow[0]?.tz ?? 'UTC'

  const result = await extractMeeting(deps.provider, deps.model, {
    fromName,
    fromAddress: ctx.email.fromAddress,
    subject: ctx.email.subject,
    body: ctx.email.body,
    sentAtIso: sentAt.toISOString(),
    recipientTimezone,
  })

  // Below the chip threshold → store-only outcome 0. Lets us measure
  // recall later by sampling false negatives.
  if (!result.hasMeeting || result.confidence < EXTRACT_CHIP_THRESHOLD) {
    await deps.db
      .insert(emailEventExtractions)
      .values({
        id: makeId(),
        emailId,
        hasMeeting: result.hasMeeting,
        confidence: result.confidence,
        outcome: 0,
      })
      .onConflictDoNothing()
    return {
      outcome: 0,
      createdEventId: null,
      confidence: result.confidence,
    }
  }

  // Validate parseable times — model can hand back garbage strings.
  const startAt = result.startAt ? safeParseDate(result.startAt) : null
  const endAt = result.endAt
    ? safeParseDate(result.endAt)
    : startAt
      ? new Date(startAt.getTime() + 60 * 60 * 1000)
      : null
  if (!startAt) {
    // Has-meeting + high confidence but no usable time = log and bail.
    await deps.db
      .insert(emailEventExtractions)
      .values({
        id: makeId(),
        emailId,
        hasMeeting: true,
        title: result.title ?? null,
        location: result.location ?? null,
        attendees: result.attendees ?? [],
        confidence: result.confidence,
        outcome: 0,
      })
      .onConflictDoNothing()
    return { outcome: 0, createdEventId: null, confidence: result.confidence }
  }

  // Auto-create vs surface-chip decision.
  let createdEventId: string | null = null
  let outcome = 1
  if (result.confidence >= EXTRACT_AUTO_THRESHOLD) {
    createdEventId = makeId()
    outcome = 2
    await deps.db.insert(calendarEvents).values({
      id: createdEventId,
      userId: ctx.userId,
      title: result.title ?? ctx.email.subject ?? 'Meeting',
      location: result.location ?? null,
      attendees: result.attendees ?? [],
      startAt,
      endAt: endAt ?? new Date(startAt.getTime() + 60 * 60 * 1000),
      sourceEmailId: emailId,
    })
    await bust(deps, ctx.userId, 'today')
  }

  await deps.db
    .insert(emailEventExtractions)
    .values({
      id: makeId(),
      emailId,
      hasMeeting: true,
      title: result.title ?? null,
      startAt,
      endAt: endAt ?? null,
      location: result.location ?? null,
      attendees: result.attendees ?? [],
      confidence: result.confidence,
      outcome,
      createdEventId,
    })
    .onConflictDoNothing()

  return { outcome, createdEventId, confidence: result.confidence }
}

function safeParseDate(s: string): Date | null {
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
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
