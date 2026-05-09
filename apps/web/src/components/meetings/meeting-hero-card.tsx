'use client'

import { CalendarDays, Lock, Video } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CalendarEvent } from '@/lib/event-queries'

export interface MeetingHeroCardProps {
  meeting: CalendarEvent | null
  /** Click-handler for the lime "Join meeting" CTA. */
  onJoin?: (meeting: CalendarEvent) => void
  className?: string
}

/**
 * Big lime hero card on the right side of the V3 meetings page.
 *
 * Pencil reference: `MeetingsV3` (`RTarH`) — green-bordered card with
 * the meeting title, start window, location/Hosted-by line and a
 * full-width JOIN MEETING CTA. Below the card: attendee chips strip.
 */
export function MeetingHeroCard({ meeting, onJoin, className }: MeetingHeroCardProps) {
  if (!meeting) {
    return (
      <div
        className={cn(
          'flex h-full flex-col items-center justify-center gap-2 px-6 py-16 text-center',
          className,
        )}
      >
        <Video className="h-8 w-8 text-wm-text-muted" />
        <p className="font-mono text-[13px] text-wm-text-secondary">
          Pick a meeting from the list to see details.
        </p>
      </div>
    )
  }
  const time = `${formatTime(meeting.startAt)} – ${formatTime(meeting.endAt)}`
  const date = new Date(meeting.startAt).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
  return (
    <div className={cn('flex flex-col gap-5 p-6', className)}>
      <article
        className="flex flex-col gap-4 rounded-2xl border border-wm-accent bg-wm-accent-dim p-6"
        style={{ boxShadow: '0 6px 32px 0 rgba(191,255,0,0.15)' }}
      >
        <header className="flex items-center justify-between">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[1.5px] text-wm-accent">
            Starting in {minutesUntil(meeting.startAt)} min
          </p>
          {meeting.hasWaitingRoom && (
            <span className="inline-flex items-center gap-1 rounded-full border border-wm-accent/40 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[1.5px] text-wm-accent">
              <Lock className="h-3 w-3" />
              Waiting room
            </span>
          )}
        </header>
        <h2 className="font-sans text-[26px] font-bold leading-tight text-wm-text-primary">
          {meeting.title}
        </h2>
        <p className="flex items-center gap-2 font-mono text-[12px] text-wm-text-secondary">
          <CalendarDays className="h-3.5 w-3.5" />
          {date} · {time}
        </p>
        {meeting.location && (
          <p className="font-mono text-[11px] text-wm-text-tertiary">
            Location: {meeting.location}
          </p>
        )}
        <button
          type="button"
          onClick={() => onJoin?.(meeting)}
          disabled={!meeting.meetingLink}
          className={cn(
            'flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-wm-accent font-mono text-[13px] font-bold uppercase tracking-[2px] text-wm-text-on-accent transition-colors hover:bg-wm-accent-hover',
            !meeting.meetingLink && 'cursor-not-allowed opacity-60',
          )}
        >
          <Video className="h-4 w-4" />
          {meeting.meetingLink ? 'Join meeting' : 'No join link'}
        </button>
      </article>

      {meeting.attendees.length > 0 && (
        <section className="flex flex-col gap-2">
          <header className="font-mono text-[10px] font-bold uppercase tracking-[1.5px] text-wm-text-tertiary">
            Attendees · {meeting.attendees.length}
          </header>
          <div className="flex flex-wrap gap-2">
            {meeting.attendees.map((a) => (
              <span
                key={a}
                className="inline-flex items-center gap-2 rounded-full border border-wm-border bg-wm-surface px-3 py-1.5 font-mono text-[11px] text-wm-text-secondary"
              >
                <span
                  className="flex h-5 w-5 items-center justify-center rounded-full bg-wm-accent text-[10px] font-bold text-wm-text-on-accent"
                  aria-hidden
                >
                  {(a.trim()[0] ?? '?').toUpperCase()}
                </span>
                {a}
              </span>
            ))}
          </div>
        </section>
      )}

      {meeting.notes && (
        <section className="rounded-xl border border-wm-border bg-wm-surface px-5 py-4">
          <header className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[1.5px] text-wm-text-tertiary">
            Notes
          </header>
          <p className="whitespace-pre-wrap font-sans text-[13px] leading-[1.55] text-wm-text-primary">
            {meeting.notes}
          </p>
        </section>
      )}
    </div>
  )
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })
}

function minutesUntil(iso: string): number {
  return Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 60_000))
}
