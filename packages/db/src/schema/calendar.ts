import { boolean, integer, jsonb, pgTable, real, text, timestamp, varchar } from 'drizzle-orm/pg-core'
import { emails } from './emails'
import { users } from './users'

export const calendarEvents = pgTable('calendar_events', {
  id: varchar('id', { length: 64 }).primaryKey(),
  userId: varchar('user_id', { length: 64 })
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  location: varchar('location', { length: 255 }),
  // Attendees stored as array of user IDs or bare email addresses.
  attendees: jsonb('attendees').notNull().default([]),
  startAt: timestamp('start_at', { withTimezone: true }).notNull(),
  endAt: timestamp('end_at', { withTimezone: true }).notNull(),
  color: varchar('color', { length: 7 }).notNull().default('#C5F135'),
  // If non-null, this event is a meeting — mobile shows it under /meet.
  meetingLink: text('meeting_link'),
  hasWaitingRoom: boolean('has_waiting_room').notNull().default(false),
  reminderMinutes: jsonb('reminder_minutes').notNull().default([15]),
  notes: text('notes'),
  // When set, this event was auto-created from the email's body. The
  // mobile thread surfaces an "Added to calendar" chip linking back to
  // it; deleting the email cascades to the event.
  sourceEmailId: varchar('source_email_id', { length: 64 }).references(
    () => emails.id,
    { onDelete: 'set null' },
  ),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

/**
 * One row per attempt the AI worker makes to extract a meeting from an
 * email body. Stored regardless of confidence so we can:
 *   - skip re-extraction on the same email (idempotent jobs)
 *   - surface the "Add to calendar?" chip in the UI for mid-band
 *     confidence (0.60–0.85) without re-running the model
 *   - measure precision/recall of the extractor over time
 */
export const emailEventExtractions = pgTable('email_event_extractions', {
  id: varchar('id', { length: 64 }).primaryKey(),
  emailId: varchar('email_id', { length: 64 })
    .notNull()
    .unique()
    .references(() => emails.id, { onDelete: 'cascade' }),
  hasMeeting: boolean('has_meeting').notNull(),
  title: varchar('title', { length: 255 }),
  startAt: timestamp('start_at', { withTimezone: true }),
  endAt: timestamp('end_at', { withTimezone: true }),
  location: varchar('location', { length: 500 }),
  attendees: jsonb('attendees').notNull().default([]),
  confidence: real('confidence').notNull(),
  // 0 = stored only, 1 = chip shown, 2 = auto-created.
  outcome: integer('outcome').notNull().default(0),
  /// When the worker auto-created an event, the FK to it. Lets the
  /// mobile chip route directly to /calendar/event/:id.
  createdEventId: varchar('created_event_id', { length: 64 }).references(
    () => calendarEvents.id,
    { onDelete: 'set null' },
  ),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
