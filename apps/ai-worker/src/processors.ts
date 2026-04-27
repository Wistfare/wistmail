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
  agenticIngest,
  autoLabel,
  classifyNeedsReply,
  deriveDisplayName,
  deriveLocalPartName,
  draftReply,
  extractMeeting,
  summarizeEmail,
  todayDigest,
  type AiProvider,
  type ToolCall,
} from '@wistmail/ai'
import {
  calendarEvents,
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
  /// to enqueue the per-job fan-out (when tool-calling is disabled)
  /// and for follow-on derive-display-name jobs.
  queue: Queue
  /// When true, the inbound ingest path runs ONE agentic model call
  /// that emits tool calls. When false, falls back to enqueueing one
  /// job per AI task (classify, summarize, label, draft, extract).
  useToolCalling: boolean
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
): Promise<{ scheduled: string[]; mode?: string }> {
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

  // Agentic path: ONE model call emits per-task tool calls. Falls
  // through to the per-job fan-out below if disabled, or if the
  // agentic call itself fails (the model returns no tool calls or
  // unparseable output). Backfill scripts always go through the
  // per-job processors directly so this branch is only the inbound
  // hot path.
  if (deps.useToolCalling) {
    const result = await processAgenticIngest(deps, emailId).catch((err) => {
      console.warn(
        `[ai-worker] agentic ingest failed for ${emailId}, falling back to per-job: ${(err as Error).message}`,
      )
      return null
    })
    if (result && result.toolCalls > 0) {
      await maybeEnqueueDeriveName(deps, emailId, opts)
      return { scheduled: ['agentic'], mode: 'agentic' }
    }
    // Fall through to per-job below.
  }

  const names: string[] = [
    JOB_NAMES.classifyNeedsReply,
    JOB_NAMES.summarize,
    JOB_NAMES.autoLabel,
    JOB_NAMES.draftReply,
    // Meeting extraction runs on every inbound — the model returns
    // hasMeeting=false cheaply for non-meeting emails. The cost of a
    // single classify-style call here is the cost of getting "meeting
    // tomorrow at 11" auto-added to the calendar without the user
    // having to do anything.
    JOB_NAMES.extractMeeting,
  ]
  for (const name of names) {
    await deps.queue.add(name, { emailId }, opts)
  }

  await maybeEnqueueDeriveName(deps, emailId, opts)
  if (
    !names.includes(JOB_NAMES.deriveDisplayName) &&
    (await emailNeedsDerivedName(deps, emailId))
  ) {
    names.push(JOB_NAMES.deriveDisplayName)
  }

  await deps.db
    .update(emails)
    .set({ aiProcessedAt: new Date() })
    .where(eq(emails.id, emailId))
  return { scheduled: names, mode: 'per-job' }
}

async function emailNeedsDerivedName(
  deps: ProcessorDeps,
  emailId: string,
): Promise<boolean> {
  const rows = await deps.db
    .select({ fromName: emails.fromName, fromAddress: emails.fromAddress })
    .from(emails)
    .where(eq(emails.id, emailId))
    .limit(1)
  const r = rows[0]
  return !!r && (r.fromName === null || r.fromName === '') && !!r.fromAddress
}

async function maybeEnqueueDeriveName(
  deps: ProcessorDeps,
  emailId: string,
  opts: { removeOnComplete: number; removeOnFail: number; attempts: number },
): Promise<void> {
  const rows = await deps.db
    .select({ fromName: emails.fromName, fromAddress: emails.fromAddress })
    .from(emails)
    .where(eq(emails.id, emailId))
    .limit(1)
  const row = rows[0]
  if (!row || !row.fromAddress) return
  if (row.fromName !== null && row.fromName !== '') return

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
}

/**
 * Single-call agentic ingest. Pulls the email + label catalog +
 * user context, makes ONE tool-calling model call, dispatches each
 * tool result to the matching DB write. Returns the count of tool
 * calls executed so the caller knows whether to fall back.
 *
 * On the happy path this replaces the 5–6 per-job model calls with
 * one. The model self-selects which tools are relevant — newsletters
 * end up with just `summarize`, real asks add `flag_needs_reply` +
 * `draft_replies`, meeting confirmations add `create_meeting`.
 */
export async function processAgenticIngest(
  deps: ProcessorDeps,
  emailId: string,
): Promise<{ toolCalls: number; executed: string[]; skipped: string[] }> {
  const ctx = await loadEmailContext(deps.db, emailId)
  if (!ctx) return { toolCalls: 0, executed: [], skipped: ['email-deleted'] }

  // We need the email's createdAt + the user's tz on top of the
  // standard email-context fields the per-job processors use.
  const [extra] = await deps.db
    .select({
      createdAt: emails.createdAt,
      tz: users.timezone,
    })
    .from(emails)
    .innerJoin(mailboxes, eq(mailboxes.id, emails.mailboxId))
    .innerJoin(users, eq(users.id, mailboxes.userId))
    .where(eq(emails.id, emailId))
    .limit(1)
  if (!extra) return { toolCalls: 0, executed: [], skipped: ['no-owner'] }

  const result = await agenticIngest(deps.provider, deps.model, {
    fromName: null, // backfill: header name lookup runs separately
    fromAddress: ctx.email.fromAddress,
    subject: ctx.email.subject,
    body: ctx.email.body,
    sentAtIso: extra.createdAt.toISOString(),
    recipientTimezone: extra.tz || 'UTC',
    userDisplayName: ctx.userDisplayName,
    availableLabels: ctx.availableLabels,
  })

  const executed: string[] = []
  const skipped: string[] = []
  let needsReplyArgs: { reason: string; urgency: number } | null = null
  let summaryWritten = false

  // First pass: extract flag_needs_reply args so apply_labels /
  // draft_replies can use the urgency for the digest merge.
  for (const c of result.toolCalls) {
    if (c.name === 'flag_needs_reply') {
      const reason = typeof c.arguments.reason === 'string' ? c.arguments.reason.slice(0, 80) : ''
      const urgency =
        typeof c.arguments.urgency === 'number'
          ? Math.max(0, Math.min(1, c.arguments.urgency))
          : 0
      if (reason) needsReplyArgs = { reason, urgency }
    }
  }

  for (const c of result.toolCalls) {
    try {
      switch (c.name) {
        case 'summarize': {
          const s = c.arguments.summary
          if (typeof s !== 'string' || s.length === 0) {
            skipped.push(`${c.name}:no-summary`)
            break
          }
          await deps.db
            .update(emails)
            .set({ autoSummary: s.slice(0, 280) })
            .where(eq(emails.id, ctx.email.id))
          summaryWritten = true
          executed.push(c.name)
          break
        }
        case 'flag_needs_reply': {
          if (!needsReplyArgs) {
            skipped.push(`${c.name}:invalid-args`)
            break
          }
          await deps.db
            .update(emails)
            .set({
              needsReply: true,
              needsReplyReason: needsReplyArgs.reason,
            })
            .where(eq(emails.id, ctx.email.id))
          // Splice into today_digests.priorities if urgent — same
          // logic the per-job classifier uses.
          if (needsReplyArgs.urgency >= 0.6) {
            await mergeEmailIntoDigest(deps, {
              userId: ctx.userId,
              emailId: ctx.email.id,
              reason: needsReplyArgs.reason,
              urgency: needsReplyArgs.urgency,
            })
          }
          executed.push(c.name)
          break
        }
        case 'apply_labels': {
          const raw = c.arguments.labels
          if (!Array.isArray(raw)) {
            skipped.push(`${c.name}:no-labels-array`)
            break
          }
          const validIds = new Set(ctx.availableLabels.map((l) => l.id))
          const picks = raw
            .filter(
              (r): r is { id: string; confidence: number } =>
                !!r &&
                typeof (r as { id?: unknown }).id === 'string' &&
                typeof (r as { confidence?: unknown }).confidence === 'number' &&
                validIds.has((r as { id: string }).id) &&
                (r as { confidence: number }).confidence >= 0.6,
            )
            .map((r) => ({
              id: r.id,
              confidence: Math.max(0, Math.min(1, r.confidence)),
            }))
          if (picks.length === 0) {
            skipped.push(`${c.name}:none-met-floor`)
            break
          }
          await deps.db.transaction(async (tx) => {
            await tx
              .delete(emailLabels)
              .where(
                and(
                  eq(emailLabels.emailId, ctx.email.id),
                  eq(emailLabels.source, 'ai'),
                ),
              )
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
          })
          executed.push(`${c.name}(${picks.length})`)
          break
        }
        case 'draft_replies': {
          const raw = c.arguments.drafts
          if (!Array.isArray(raw)) {
            skipped.push(`${c.name}:no-drafts-array`)
            break
          }
          const drafts: Array<{
            tone: 'concise' | 'warm' | 'decline'
            body: string
            score: number
          }> = []
          for (const d of raw) {
            if (
              !d ||
              typeof d !== 'object' ||
              typeof (d as { tone?: unknown }).tone !== 'string' ||
              typeof (d as { body?: unknown }).body !== 'string' ||
              typeof (d as { score?: unknown }).score !== 'number'
            ) {
              continue
            }
            const tone = (d as { tone: string }).tone as
              | 'concise'
              | 'warm'
              | 'decline'
            if (tone !== 'concise' && tone !== 'warm' && tone !== 'decline') continue
            const score = Math.max(
              0,
              Math.min(1, (d as { score: number }).score),
            )
            if (score < 0.4) continue
            drafts.push({
              tone,
              body: (d as { body: string }).body.slice(0, 1200),
              score,
            })
          }
          if (drafts.length === 0) {
            skipped.push(`${c.name}:none-met-floor`)
            break
          }
          await deps.db.transaction(async (tx) => {
            await tx
              .delete(emailReplySuggestions)
              .where(eq(emailReplySuggestions.emailId, ctx.email.id))
            await tx.insert(emailReplySuggestions).values(
              drafts.map((d) => ({
                id: makeId(),
                emailId: ctx.email.id,
                tone: d.tone,
                body: d.body,
                score: d.score,
              })),
            )
          })
          executed.push(`${c.name}(${drafts.length})`)
          break
        }
        case 'create_meeting': {
          const conf =
            typeof c.arguments.confidence === 'number'
              ? c.arguments.confidence
              : 0
          if (conf < 0.85) {
            // Below auto-create floor — still record we ran, so the
            // backfill path doesn't keep retrying.
            await deps.db
              .update(emails)
              .set({ meetingExtractedAt: new Date() })
              .where(eq(emails.id, ctx.email.id))
            skipped.push(`${c.name}:low-confidence(${conf})`)
            break
          }
          const startStr = c.arguments.startAt
          const start = typeof startStr === 'string' ? new Date(startStr) : null
          if (!start || Number.isNaN(start.getTime())) {
            await deps.db
              .update(emails)
              .set({ meetingExtractedAt: new Date() })
              .where(eq(emails.id, ctx.email.id))
            skipped.push(`${c.name}:unparseable-start`)
            break
          }
          let end = new Date(start.getTime() + 60 * 60 * 1000)
          if (typeof c.arguments.endAt === 'string') {
            const parsed = new Date(c.arguments.endAt)
            if (!Number.isNaN(parsed.getTime())) end = parsed
          }
          const title =
            typeof c.arguments.title === 'string' && c.arguments.title.length > 0
              ? c.arguments.title.slice(0, 200)
              : ctx.email.subject || 'Meeting'
          const location =
            typeof c.arguments.location === 'string'
              ? c.arguments.location.slice(0, 500)
              : null
          const attendees = Array.isArray(c.arguments.attendees)
            ? (c.arguments.attendees as unknown[])
                .filter((a): a is string => typeof a === 'string')
                .slice(0, 20)
            : []

          const eventId = `evt_${makeId()}`
          await deps.db.transaction(async (tx) => {
            await tx.insert(calendarEvents).values({
              id: eventId,
              userId: ctx.userId,
              title,
              description: null,
              location,
              attendees,
              startAt: start,
              endAt: end,
              color: '#C5F135',
              meetingLink: null,
              hasWaitingRoom: false,
              reminderMinutes: [15],
              notes: null,
              source: 'ai',
              sourceEmailId: ctx.email.id,
            })
            await tx
              .update(emails)
              .set({
                meetingExtractedAt: new Date(),
                meetingEventId: eventId,
              })
              .where(eq(emails.id, ctx.email.id))
          })
          executed.push(`${c.name}(${conf})`)
          break
        }
        default:
          skipped.push(`${c.name}:unknown-tool`)
      }
    } catch (err) {
      console.warn(`[ai-worker] tool ${c.name} dispatch failed:`, (err as Error).message)
      skipped.push(`${c.name}:dispatch-error`)
    }
  }

  // If the model didn't call extract-meeting at all, still mark the
  // row so backfills know we processed it.
  if (!result.toolCalls.find((c) => c.name === 'create_meeting')) {
    await deps.db
      .update(emails)
      .set({ meetingExtractedAt: new Date() })
      .where(eq(emails.id, ctx.email.id))
  }

  // Flush cache busts based on what we wrote.
  if (summaryWritten || needsReplyArgs) {
    await bust(deps, ctx.userId, 'today')
    await bust(deps, ctx.userId, 'unified-inbox')
  }

  return { toolCalls: result.toolCalls.length, executed, skipped }
}
// `ToolCall` is referenced for typing inside the function above; keep
// the import surface from drifting if a future edit removes the local
// usage.
void (null as unknown as ToolCall)

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

/**
 * Try to lift a meeting out of the email and (when confident enough)
 * auto-create a calendar_events row linked back to the source email.
 * Confidence bands:
 *   ≥ 0.85 — auto-create. The user wakes up to find the meeting
 *            already on their Today screen.
 *   0.60–0.85 — record the extraction (meeting_extracted_at) but
 *            don't write a calendar row. Mobile UI shows an
 *            "Add to calendar?" chip on the email (future work).
 *   < 0.60 — silent. Marker recorded so we never re-run on this row.
 */
export async function processExtractMeeting(
  deps: ProcessorDeps,
  job: Job<ExtractMeetingJob>,
): Promise<{
  hasMeeting: boolean
  confidence: number
  eventId?: string
  reason?: string
}> {
  const { emailId, force } = job.data

  // Idempotency: skip rows we've already extracted from unless the
  // operator forces a re-run.
  const existing = await deps.db
    .select({
      meetingExtractedAt: emails.meetingExtractedAt,
      meetingEventId: emails.meetingEventId,
      fromAddress: emails.fromAddress,
      fromName: emails.fromName,
      subject: emails.subject,
      textBody: emails.textBody,
      htmlBody: emails.htmlBody,
      mailboxId: emails.mailboxId,
      createdAt: emails.createdAt,
    })
    .from(emails)
    .where(eq(emails.id, emailId))
    .limit(1)
  const erow = existing[0]
  if (!erow) return { hasMeeting: false, confidence: 0, reason: 'email-deleted' }
  if (!force && erow.meetingExtractedAt) {
    return {
      hasMeeting: false,
      confidence: 0,
      eventId: erow.meetingEventId ?? undefined,
      reason: 'already-extracted',
    }
  }

  // Resolve the user (we need their timezone for the model and the
  // user_id for the calendar insert).
  const owner = await deps.db
    .select({ userId: mailboxes.userId, tz: users.timezone })
    .from(mailboxes)
    .innerJoin(users, eq(users.id, mailboxes.userId))
    .where(eq(mailboxes.id, erow.mailboxId))
    .limit(1)
  if (!owner[0]) {
    return { hasMeeting: false, confidence: 0, reason: 'no-owner' }
  }

  const body = stripQuotedAndTrim(erow.textBody, erow.htmlBody)
  if (!body || body.length < 10) {
    // Empty body — definitely no meeting. Mark and skip.
    await deps.db
      .update(emails)
      .set({ meetingExtractedAt: new Date() })
      .where(eq(emails.id, emailId))
    return { hasMeeting: false, confidence: 0, reason: 'empty-body' }
  }

  const result = await extractMeeting(deps.provider, deps.model, {
    fromName: erow.fromName,
    fromAddress: erow.fromAddress,
    subject: erow.subject,
    body,
    sentAtIso: erow.createdAt.toISOString(),
    recipientTimezone: owner[0].tz || 'UTC',
  })

  // Record that we ran, regardless of outcome — keeps re-runs cheap.
  if (!result.hasMeeting || result.confidence < 0.85) {
    await deps.db
      .update(emails)
      .set({ meetingExtractedAt: new Date() })
      .where(eq(emails.id, emailId))
    return {
      hasMeeting: result.hasMeeting,
      confidence: result.confidence,
      reason: result.confidence >= 0.6 ? 'awaiting-confirmation' : 'low-confidence',
    }
  }

  // ≥ 0.85: auto-create. Validate startAt parses to a real Date — if
  // the model returned a malformed string, drop to the chip band.
  const start = result.startAt ? new Date(result.startAt) : null
  if (!start || Number.isNaN(start.getTime())) {
    await deps.db
      .update(emails)
      .set({ meetingExtractedAt: new Date() })
      .where(eq(emails.id, emailId))
    return { hasMeeting: true, confidence: result.confidence, reason: 'unparseable-startAt' }
  }
  // Default end = start + 1h. Validate too.
  let end: Date
  if (result.endAt) {
    const parsed = new Date(result.endAt)
    end = Number.isNaN(parsed.getTime()) ? new Date(start.getTime() + 60 * 60 * 1000) : parsed
  } else {
    end = new Date(start.getTime() + 60 * 60 * 1000)
  }

  const eventId = `evt_${makeId()}`
  await deps.db.transaction(async (tx) => {
    await tx.insert(calendarEvents).values({
      id: eventId,
      userId: owner[0]!.userId,
      title: result.title || erow.subject || 'Meeting',
      description: null,
      location: result.location ?? null,
      attendees: result.attendees ?? [],
      startAt: start,
      endAt: end,
      // Sparkle accent for AI-sourced events — UI uses the source
      // column to render a different chip.
      color: '#C5F135',
      meetingLink: null,
      hasWaitingRoom: false,
      reminderMinutes: [15],
      notes: null,
      source: 'ai',
      sourceEmailId: emailId,
    })
    await tx
      .update(emails)
      .set({ meetingExtractedAt: new Date(), meetingEventId: eventId })
      .where(eq(emails.id, emailId))
  })

  // Bust the user's Today cache so the new event shows on next pull.
  await bust(deps, owner[0].userId, 'today')

  return { hasMeeting: true, confidence: result.confidence, eventId }
}

/// Strip quoted reply blocks (lines starting with `>`) and email-client
/// "On … wrote:" preambles before handing the body to the model. The
/// extractor's prompt explicitly forbids pulling dates from quoted
/// history, but pre-trimming reduces token count + removes the
/// temptation entirely.
function stripQuotedAndTrim(text: string | null, html: string | null): string {
  let body = text ?? ''
  if (!body && html) {
    body = html.replace(/<[^>]+>/g, ' ')
  }
  const lines = body
    .split(/\r?\n/)
    .filter((l) => !/^\s*>/.test(l))
    .filter((l) => !/^On .{1,80}wrote:\s*$/i.test(l))
  return lines.join('\n').replace(/\s+/g, ' ').trim().slice(0, 4000)
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

  const userRow = await deps.db
    .select({ name: users.name, timezone: users.timezone })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  if (!userRow[0]) return { skipped: 'user-not-found' }

  // Day window in the user's timezone, not the server's. The mobile
  // client sends X-Client-Timezone on every request and the API
  // persists it to users.timezone — fall back to UTC if unset.
  const tz = userRow[0].timezone || 'UTC'
  const { dayStart, dayEnd } = userLocalDayBounds(now, tz)

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

  // No work to summarise — DON'T call the model. An empty input was
  // the trigger for the model to invent a fictional CEO morning
  // ("10 AM marketing meeting", "Q3 strategy memo") with fabricated
  // ids. Store an empty digest so the API serves null and the UI
  // hides the briefing card cleanly.
  if (pendingEmails.length === 0 && todayEvents.length === 0 && openTasks.length === 0) {
    const empty = { briefing: '', priorities: [], focusBlocks: [] }
    await deps.db
      .insert(todayDigests)
      .values({ userId, content: empty, generatedAt: now })
      .onConflictDoUpdate({
        target: todayDigests.userId,
        set: { content: empty, generatedAt: now },
      })
    await bust(deps, userId, 'today')
    return { skipped: 'no-input' }
  }

  const inputEmails = pendingEmails.map((e) => ({
    id: e.id,
    fromAddress: e.fromAddress,
    subject: e.subject,
    snippet: (e.snippet ?? '').slice(0, 200),
    needsReply: e.needsReply,
  }))
  const inputEvents = todayEvents.map((e) => ({
    id: e.id,
    title: e.title,
    startAt: e.startAt.toISOString(),
    endAt: e.endAt.toISOString(),
  }))
  const inputTasks = openTasks.map((t) => ({
    id: t.id,
    title: t.title,
    projectName: t.projectName,
    status: t.status,
  }))

  const result = await todayDigest(deps.provider, deps.model, {
    userDisplayName: userRow[0].name,
    pendingEmails: inputEmails,
    todayEvents: inputEvents,
    openTasks: inputTasks,
  })

  // Drop priority entries whose id wasn't in the prompt — those are
  // textbook hallucinations (the model invents a sentence-like
  // string and crams it into the id slot).
  const validIds = new Set<string>([
    ...inputEmails.map((e) => `email:${e.id}`),
    ...inputEvents.map((e) => `event:${e.id}`),
    ...inputTasks.map((t) => `task:${t.id}`),
  ])
  const groundedPriorities = result.priorities.filter((p) =>
    validIds.has(`${p.kind}:${p.id}`),
  )
  const grounded = { ...result, priorities: groundedPriorities }

  await deps.db
    .insert(todayDigests)
    .values({ userId, content: grounded, generatedAt: now })
    .onConflictDoUpdate({
      target: todayDigests.userId,
      set: { content: grounded, generatedAt: now },
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

/// Day boundaries (00:00:00.000 → next 00:00) in the user's IANA
/// timezone, returned as UTC Date objects suitable for direct
/// comparison against timestamptz columns.
///
/// Without this the digest used the worker container's local time
/// (UTC), so a user in Africa/Kigali (UTC+2) opening their app at
/// 09:00 local would see "today's events" filtered to UTC's day
/// window — missing anything scheduled between 22:00–24:00 Kigali
/// the previous evening, etc. Falls back to UTC bounds on a malformed
/// IANA string so a bad row never crashes the digest.
export function userLocalDayBounds(
  now: Date,
  timezone: string,
): { dayStart: Date; dayEnd: Date } {
  try {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
    const parts = fmt.formatToParts(now)
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00'
    // Build "YYYY-MM-DD" of the user's local date, then re-anchor at
    // midnight in their tz. Trick: format a known-UTC midnight in the
    // target tz and subtract the offset to find the matching UTC
    // instant.
    const dateStr = `${get('year')}-${get('month')}-${get('day')}`
    const dayStart = zonedMidnightToUtc(dateStr, timezone)
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000)
    return { dayStart, dayEnd }
  } catch {
    const dayStart = new Date(now)
    dayStart.setUTCHours(0, 0, 0, 0)
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000)
    return { dayStart, dayEnd }
  }
}

/// Return the UTC Date that corresponds to `YYYY-MM-DD 00:00` in the
/// given IANA zone. Done by introspecting the offset that Intl
/// reports for that wall time and subtracting it.
function zonedMidnightToUtc(yyyyMmDd: string, timezone: string): Date {
  // Probe: ask Intl what the formatted date would be for an epoch
  // anchored at the candidate UTC midnight. Adjust until they match.
  // Two passes is enough for any IANA zone (covers DST edges).
  let probe = new Date(`${yyyyMmDd}T00:00:00Z`)
  for (let i = 0; i < 2; i++) {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
    const parts = fmt.formatToParts(probe)
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00'
    const localDate = `${get('year')}-${get('month')}-${get('day')}`
    const localHour = parseInt(get('hour'), 10)
    const localMin = parseInt(get('minute'), 10)
    // Difference between desired (yyyyMmDd 00:00) and what probe
    // currently lands on, in minutes.
    const desiredEpoch = new Date(`${yyyyMmDd}T00:00:00Z`).getTime()
    const probedEpoch = new Date(`${localDate}T00:00:00Z`).getTime()
    const dayDelta = (desiredEpoch - probedEpoch) / 60000
    const minutesDelta = dayDelta - (localHour * 60 + localMin)
    if (minutesDelta === 0) return probe
    probe = new Date(probe.getTime() + minutesDelta * 60000)
  }
  return probe
}

// Imports referenced only by the digest path; suppress lint by touching here.
void isNull
