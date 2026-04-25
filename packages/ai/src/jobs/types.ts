/**
 * Inputs and outputs for the AI worker job functions. Each job is a
 * pure function over its input + an `AiProvider` — DB access happens
 * in the worker, not here. Keeps these unit-testable with a fake provider.
 */

export interface ClassifyInput {
  fromAddress: string
  subject: string
  /// Plain-text body, truncated upstream to ~4k chars before this is called.
  /// 4k chars ≈ 1k tokens — well within Gemma 4's 128K window even at
  /// the cheap end, and bounds wall time.
  body: string
}

export interface ClassifyOutput {
  needsReply: boolean
  /// 1-line, present-tense, ≤80 chars. Surfaced under the row in the
  /// Today screen "Needs Reply" section, e.g. "Sarah is waiting on
  /// your sign-off before sending the deck."
  reason: string
}

export interface SummarizeInput {
  subject: string
  body: string
}

export interface SummarizeOutput {
  /// 2 sentences max. Replaces the snippet in the unified inbox when
  /// the body has more substance than the snippet captures.
  summary: string
}

export interface AutoLabelInput {
  fromAddress: string
  subject: string
  body: string
  /// User's existing label set. The model picks zero or more from this
  /// list — it never invents new labels.
  availableLabels: Array<{ id: string; name: string }>
}

export interface AutoLabelOutput {
  /// Picked labels with confidence 0..1. Worker filters out anything
  /// below 0.6 before writing.
  labels: Array<{ id: string; confidence: number }>
}

export interface DraftReplyInput {
  fromName: string | null
  fromAddress: string
  subject: string
  body: string
  /// User's display name + signature snippet, used to keep tone aligned.
  userDisplayName: string
}

export interface DraftReplyOutput {
  drafts: Array<{
    tone: 'concise' | 'warm' | 'decline'
    body: string
    /// 0..1 self-rated. Worker drops drafts under 0.4.
    score: number
  }>
}

export interface TodayDigestInput {
  userDisplayName: string
  /// Pre-fetched context — the worker reads DB once and hands the model
  /// a compact view. Keeping this typed avoids the temptation to dump
  /// raw rows into the prompt.
  pendingEmails: Array<{
    id: string
    fromAddress: string
    subject: string
    snippet: string
    needsReply: boolean | null
  }>
  todayEvents: Array<{
    id: string
    title: string
    startAt: string
    endAt: string
  }>
  openTasks: Array<{
    id: string
    title: string
    projectName: string
    status: string
  }>
}

export interface TodayDigestOutput {
  briefing: string
  priorities: Array<{
    kind: 'email' | 'task' | 'event'
    id: string
    reason: string
  }>
  focusBlocks: Array<{
    startAt: string
    endAt: string
    label: string
  }>
}
