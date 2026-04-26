import { index, pgTable, real, timestamp, varchar } from 'drizzle-orm/pg-core'

/**
 * Cross-user cache of resolved display names for email addresses.
 *
 * The AI worker is expensive (one Gemma 4 generation per resolution).
 * Caching by lowercased address means we run at most once per unique
 * sender, not once per email — so when the same person sends a second
 * email, we hit the cache instantly and never call the model.
 *
 * Source ordering (highest priority first):
 *   - 'header'    — from a real RFC-5322 From header. Always trumps.
 *   - 'heuristic' — split local-part on dots/underscores/dashes.
 *   - 'ai'        — model derived from a fused local-part.
 *   - 'unknown'   — explicit marker meaning "we tried, no good name".
 *                   Skips future AI calls for this address.
 *
 * Global (no user FK) on purpose. The display name attached to an
 * address is the same regardless of which user receives mail from
 * that address — there's no privacy concern with sharing the cache,
 * and per-user duplication would burn the model 17x more on the
 * same address.
 */
export const senderNames = pgTable(
  'sender_names',
  {
    /// Lowercased email address. Primary key — natural dedup.
    address: varchar('address', { length: 255 }).primaryKey(),
    /// The display name we'll surface in the UI. May be empty when
    /// `source = 'unknown'` (cache marker, skip the AI next time).
    displayName: varchar('display_name', { length: 255 }).notNull(),
    source: varchar('source', { length: 12 }).notNull(),
    /// 0..1, only meaningful for ai/heuristic sources. NULL for 'header'.
    confidence: real('confidence'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('sender_names_source_idx').on(table.source)],
)
