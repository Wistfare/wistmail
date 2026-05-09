'use client'

import { CalendarDays, CheckCircle2, Circle, Video } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface TodayEvent {
  id: string
  title: string
  startsAt: string
  endsAt?: string
  location?: string
  attendees?: { name: string; avatarUrl?: string | null }[]
  isNext?: boolean
  meetingUrl?: string
}

export interface TodayAction {
  id: string
  title: string
  /** "30 min" / "Reply by 4pm" — short context strings shown muted. */
  hint?: string
  done?: boolean
  onToggle?: () => void
}

export interface TodayPanelProps {
  /** Wall-clock now — defaults to `new Date()` but injectable for tests. */
  now?: Date
  events: TodayEvent[]
  actions?: TodayAction[]
  /** Click handler for the green Join button on the next-up event. */
  onJoinMeeting?: (event: TodayEvent) => void
  className?: string
}

/**
 * Right-rail "Today" agenda. Pencil reference: `InboxV3.TodayRail`
 * (`L0nig`) — width 308, padding [20, 16], gap 18.
 * - Header: weekday/date eyebrow + "Today" headline.
 * - Next-up: lime-bordered card (cornerRadius 16) with title + meta + JOIN.
 * - Schedule: vertical list of remaining events.
 * - Actions: tickbox-style task list at the bottom.
 */
export function TodayPanel({
  now = new Date(),
  events,
  actions = [],
  onJoinMeeting,
  className,
}: TodayPanelProps) {
  const next = events.find((e) => e.isNext) ?? events[0]
  const rest = events.filter((e) => e.id !== next?.id)
  const dayLabel = now
    .toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
    .toUpperCase()
  return (
    <aside
      className={cn(
        'flex w-[308px] shrink-0 flex-col gap-5 border-l border-wm-border bg-wm-bg p-5',
        className,
      )}
    >
      <header className="flex flex-col gap-0.5">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[1px] text-wm-text-tertiary">
          {dayLabel}
        </p>
        <h2 className="font-mono text-2xl font-bold text-wm-text-primary">Today</h2>
      </header>

      {next && (
        <NextUpCard event={next} onJoin={() => onJoinMeeting?.(next)} />
      )}

      {rest.length > 0 && (
        <section className="flex flex-col gap-2">
          <header className="flex items-center justify-between">
            <span className="font-mono text-[10px] font-bold uppercase tracking-[1.5px] text-wm-text-tertiary">
              Schedule
            </span>
            <span className="font-mono text-[10px] text-wm-text-muted">{rest.length} more</span>
          </header>
          <div className="flex flex-col">
            {rest.map((e) => (
              <ScheduleRow key={e.id} event={e} />
            ))}
          </div>
        </section>
      )}

      {actions.length > 0 && (
        <section className="flex flex-col gap-1">
          <header className="flex items-center justify-between pb-1">
            <span className="font-mono text-[10px] font-bold uppercase tracking-[1.5px] text-wm-text-tertiary">
              Action items
            </span>
            <span className="font-mono text-[10px] text-wm-text-muted">
              {actions.filter((a) => !a.done).length} open
            </span>
          </header>
          {actions.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={a.onToggle}
              className="flex cursor-pointer items-center gap-2.5 px-1 py-2 text-left transition-colors hover:bg-wm-surface-hover"
            >
              {a.done ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-wm-accent" />
              ) : (
                <Circle className="h-4 w-4 shrink-0 text-wm-text-muted" />
              )}
              <span
                className={cn(
                  'flex-1 truncate font-mono text-[12px]',
                  a.done
                    ? 'text-wm-text-muted line-through'
                    : 'text-wm-text-primary',
                )}
              >
                {a.title}
              </span>
              {a.hint && (
                <span className="shrink-0 font-mono text-[10px] text-wm-text-muted">
                  {a.hint}
                </span>
              )}
            </button>
          ))}
        </section>
      )}
    </aside>
  )
}

function NextUpCard({ event, onJoin }: { event: TodayEvent; onJoin?: () => void }) {
  const time = `${formatTime(event.startsAt)}${event.endsAt ? ` – ${formatTime(event.endsAt)}` : ''}`
  return (
    <article
      className="flex flex-col gap-2.5 rounded-2xl border border-wm-accent bg-wm-accent-dim p-3.5"
      style={{ boxShadow: '0 6px 20px 0 rgba(191,255,0,0.12)' }}
    >
      <header className="flex items-center justify-between">
        <span className="font-mono text-[9px] font-bold uppercase tracking-[1.5px] text-wm-accent">
          Up next · in {minutesUntil(event.startsAt)} min
        </span>
        <Video className="h-3.5 w-3.5 text-wm-accent" />
      </header>
      <h3 className="font-mono text-[15px] font-bold leading-tight text-wm-text-primary">
        {event.title}
      </h3>
      <div className="flex items-center gap-2 font-mono text-[11px] text-wm-text-secondary">
        <CalendarDays className="h-3 w-3" />
        <span>{time}</span>
        {event.location && <span className="truncate">· {event.location}</span>}
      </div>
      {event.attendees && event.attendees.length > 0 && (
        <div className="flex items-center -space-x-2">
          {event.attendees.slice(0, 4).map((a, i) => (
            <span
              key={i}
              className="flex h-6 w-6 items-center justify-center rounded-full border border-wm-bg bg-wm-surface font-mono text-[9px] font-semibold text-wm-text-primary"
              title={a.name}
            >
              {(a.name.trim()[0] || '?').toUpperCase()}
            </span>
          ))}
          {event.attendees.length > 4 && (
            <span className="flex h-6 items-center justify-center rounded-full bg-wm-surface px-1.5 font-mono text-[9px] text-wm-text-tertiary">
              +{event.attendees.length - 4}
            </span>
          )}
        </div>
      )}
      <button
        type="button"
        onClick={onJoin}
        className="mt-1 flex h-9 w-full items-center justify-center gap-2 rounded-full bg-wm-accent font-mono text-[11px] font-bold uppercase tracking-[1.5px] text-wm-text-on-accent transition-colors hover:bg-wm-accent-hover"
      >
        <Video className="h-3.5 w-3.5" />
        Join meeting
      </button>
    </article>
  )
}

function ScheduleRow({ event }: { event: TodayEvent }) {
  return (
    <div className="flex items-start gap-3 border-b border-wm-border py-2.5 last:border-b-0">
      <span className="w-12 shrink-0 font-mono text-[11px] text-wm-text-tertiary">
        {formatTime(event.startsAt)}
      </span>
      <span className="flex flex-col gap-0.5 truncate">
        <span className="truncate font-sans text-[12px] font-medium text-wm-text-primary">
          {event.title}
        </span>
        {event.location && (
          <span className="truncate font-mono text-[10px] text-wm-text-muted">
            {event.location}
          </span>
        )}
      </span>
    </div>
  )
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })
}

function minutesUntil(iso: string) {
  const diff = new Date(iso).getTime() - Date.now()
  return Math.max(0, Math.round(diff / 60000))
}
