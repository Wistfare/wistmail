/**
 * BullMQ queue + job-name constants. Imported by both the API (which
 * enqueues) and the worker (which consumes). Keeping the names here
 * means a typo on either side breaks at import time, not at runtime.
 */

// BullMQ rejects ':' in queue names (it's the internal Redis key
// separator). Use a hyphen.
export const AI_QUEUE = 'wm-ai'

export const JOB_NAMES = {
  classifyNeedsReply: 'classify-needs-reply',
  summarize: 'summarize-email',
  autoLabel: 'auto-label',
  draftReply: 'draft-reply',
  todayDigest: 'today-digest',
  /// Resolves a display name for an email's sender when the inbound
  /// From header lacked one. Cached in `sender_names` so subsequent
  /// emails from the same address are zero-cost.
  deriveDisplayName: 'derive-display-name',
  /// Fans out per-email jobs after a new email arrives. The worker
  /// expands this into the four per-email jobs so the API only
  /// publishes one event.
  ingestEmail: 'ingest-email',
} as const

export type JobName = (typeof JOB_NAMES)[keyof typeof JOB_NAMES]

export interface IngestEmailJob {
  emailId: string
  /// Skip the idempotency check — used by the manual "re-run AI" path.
  force?: boolean
}

export interface ClassifyNeedsReplyJob {
  emailId: string
}

export interface SummarizeJob {
  emailId: string
}

export interface AutoLabelJob {
  emailId: string
}

export interface DraftReplyJob {
  emailId: string
}

export interface TodayDigestJob {
  userId: string
}

export interface DeriveDisplayNameJob {
  /// Lowercased email address. Worker uses this both as cache key and
  /// for the heuristic / AI input.
  address: string
  /// Optional — when set, the worker also writes the resolved name
  /// back to this email row. Skipped when null (used by the
  /// "warm the cache" backfill path).
  emailId: string | null
}
