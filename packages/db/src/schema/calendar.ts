import { boolean, jsonb, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core'
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
  /// Where this event came from. 'user' for hand-created, 'ai' when
  /// the meeting-extraction job pulled it out of an inbound email.
  /// The mobile UI shows a sparkle chip on AI-sourced events the user
  /// can tap to confirm or dismiss.
  source: varchar('source', { length: 8 }).notNull().default('user'),
  /// When source='ai', the inbound email the meeting was lifted from.
  /// NULL otherwise.
  sourceEmailId: varchar('source_email_id', { length: 64 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
