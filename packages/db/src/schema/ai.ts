import { index, jsonb, pgTable, real, text, timestamp, varchar } from 'drizzle-orm/pg-core'
import { emails } from './emails'
import { users } from './users'

/**
 * AI-generated reply suggestions for an inbound email. The worker writes
 * 1–3 rows per email after the `draft-reply` job completes; the Thread
 * screen surfaces them as taps-to-fill chips above the compose area.
 *
 * Suggestions are throwaway — re-running the job replaces all rows for
 * the email (DELETE+INSERT in a transaction) so we never accumulate
 * stale drafts.
 */
export const emailReplySuggestions = pgTable(
  'email_reply_suggestions',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    emailId: varchar('email_id', { length: 64 })
      .notNull()
      .references(() => emails.id, { onDelete: 'cascade' }),
    /// Tone tag chosen by the model: 'concise' | 'warm' | 'decline'.
    /// The chip label on the Thread screen comes from this.
    tone: varchar('tone', { length: 16 }).notNull(),
    body: text('body').notNull(),
    /// Model self-rated quality 0..1. Lowest scores are dropped at
    /// render time so chips never feel obviously wrong.
    score: real('score').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('email_reply_suggestions_email_idx').on(table.emailId)],
)

/**
 * Pre-computed Today-screen digest, regenerated nightly by a cron job
 * and on-demand when the user taps "Refresh". The Today screen reads
 * this row first and falls back to its component aggregator only if
 * the digest is missing or stale.
 *
 * One row per user (PK on userId). The `content` jsonb mirrors the
 * shape the Today endpoint already returns plus AI-only fields:
 * - priorities: ranked list of email/task IDs the user should tackle
 * - focusBlocks: suggested focus-time windows around their calendar
 * - briefing: 1–2 sentence "good morning" overview
 */
export const todayDigests = pgTable(
  'today_digests',
  {
    userId: varchar('user_id', { length: 64 })
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    content: jsonb('content').$type<TodayDigestContent>().notNull(),
    /// Server-side time the digest was generated. Used by the Today
    /// endpoint to decide whether to serve the digest or fall back.
    /// Older than 12h = stale, regenerate.
    generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
  },
)

export interface TodayDigestContent {
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
