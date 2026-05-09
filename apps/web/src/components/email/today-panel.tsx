'use client'

import {
  CalendarDays,
  CheckCircle2,
  Circle,
  Plus,
  Sun,
  Video,
} from 'lucide-react'
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
  /** Future events to surface in the "COMING UP" section when today is
   * empty. Pencil shows just one row but the component renders up to 3. */
  comingUp?: TodayEvent[]
  /** Click handler for the green Join button on the next-up event. */
  onJoinMeeting?: (event: TodayEvent) => void
  /** Empty-state CTA: "+ ADD A TASK" routes to /work or pops a quick
   * task composer. The component just fires the callback. */
  onAddTask?: () => void
  className?: string
}

/**
 * Right-rail "Today" agenda. Two modes:
 *
 * - Populated — Pencil `InboxV3.TodayRail` (`L0nig`):
 *     header "WEDNESDAY · APR 23" eyebrow + "Today" 24/700,
 *     lime "Up next" card, schedule list, action items.
 *
 * - Empty — Pencil `Screen/InboxV3-Empty.TodayRail` (`Syj0y`):
 *     smaller header "TODAY" eyebrow + "Tue · Apr 14" 14/700,
 *     centered empty card with sun-icon tile + copy + "ADD A TASK"
 *     CTA, plus a "COMING UP" section with the next future event.
 *
 * The component picks its mode automatically from `events.length` —
 * callers don't need to gate.
 */
export function TodayPanel({
  now = new Date(),
  events,
  actions = [],
  comingUp = [],
  onJoinMeeting,
  onAddTask,
  className,
}: TodayPanelProps) {
  const isEmpty = events.length === 0 && actions.length === 0

  if (isEmpty) {
    return <TodayEmpty now={now} comingUp={comingUp} onAddTask={onAddTask} className={className} />
  }

  const next = events.find((e) => e.isNext) ?? events[0]
  const rest = events.filter((e) => e.id !== next?.id)
  const dayLabel = now
    .toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    })
    .toUpperCase()
  return (
    <aside
      className={cn('flex shrink-0 flex-col', className)}
      style={{
        width: 308,
        background: '#000000',
        padding: '20px 16px',
        gap: 18,
        borderLeft: '1px solid var(--color-wm-border)',
      }}
    >
      <header className="flex flex-col" style={{ gap: 2 }}>
        <p
          className="font-mono font-bold uppercase"
          style={{ fontSize: 10, letterSpacing: 1, color: '#6e6e6e' }}
        >
          {dayLabel}
        </p>
        <h2
          className="font-mono font-bold text-wm-text-primary"
          style={{ fontSize: 24 }}
        >
          Today
        </h2>
      </header>

      {next && <NextUpCard event={next} onJoin={() => onJoinMeeting?.(next)} />}

      {rest.length > 0 && (
        <section className="flex flex-col gap-2">
          <header className="flex items-center justify-between">
            <span
              className="font-mono font-bold uppercase"
              style={{ fontSize: 10, letterSpacing: 1.5, color: '#6e6e6e' }}
            >
              Schedule
            </span>
            <span className="font-mono text-[10px] text-wm-text-muted">
              {rest.length} more
            </span>
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
            <span
              className="font-mono font-bold uppercase"
              style={{ fontSize: 10, letterSpacing: 1.5, color: '#6e6e6e' }}
            >
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

/**
 * Empty TodayRail — Pencil `Syj0y`.
 *
 *   container: 308 wide, bg #000000, padding [20, 16], gap 18, vertical.
 *
 *   eTrH (`vreEw`, justify space-between):
 *     eTrHL (gap 2 vertical):
 *       "TODAY" 9/700 #6e6e6e tracking 1.5
 *       "Tue · Apr 14" 14/700 white
 *
 *   eTrCard (`L8Emz`): cornerRadius 14, 1px #1A1A1A border, padding
 *     [36, 18], gap 18, alignItems + justifyContent center, fills
 *     container height.
 *       eTrIco (`TmqpK`) 64×64 round-square (radius 18), bg #000000,
 *         1px #1A1A1A border, centered sun icon 28×28 LIME.
 *       eTrCpy gap 8 vertical, alignItems center:
 *         "Nothing on today." 15/700 white centered
 *         "No meetings, no due tasks. Add something or take the calm
 *          as a win." 11/500 #999999 lh 1.6 centered
 *       eTrCta button: cornerRadius 10, bg #000000, 1px #1A1A1A border,
 *         padding [10, 14], gap 8, full-width, plus 13 white +
 *         "ADD A TASK" 10/700 white tracking 1.5.
 *
 *   eTrSec (`C8xD9`, vertical, gap 10):
 *     "COMING UP" 9/700 #6e6e6e tracking 1.5
 *     eTrU card (radius 10, bg #111111, 1px #1A1A1A border, padding
 *       [10, 12], gap 12, alignItems center):
 *       eTrUd 32×32 day chip (radius 8, bg #000000, 1px border,
 *         centered day-of-month 11/700 #999999)
 *       eTrUC col gap 2: "<title> · <HH:MM>" 11/500 white +
 *         "Tomorrow" / "Mon, Apr 28" 9/700 #6e6e6e tracking 1
 */
function TodayEmpty({
  now,
  comingUp,
  onAddTask,
  className,
}: {
  now: Date
  comingUp: TodayEvent[]
  onAddTask?: () => void
  className?: string
}) {
  const dateLabel = now.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
  return (
    <aside
      className={cn('flex shrink-0 flex-col', className)}
      style={{
        width: 308,
        background: '#000000',
        padding: '20px 16px',
        gap: 18,
        borderLeft: '1px solid var(--color-wm-border)',
      }}
    >
      {/* eTrH header */}
      <header className="flex w-full items-center justify-between">
        <div className="flex flex-col" style={{ gap: 2 }}>
          <p
            className="font-mono font-bold uppercase"
            style={{ fontSize: 9, letterSpacing: 1.5, color: '#6e6e6e' }}
          >
            Today
          </p>
          <p
            className="font-mono font-bold text-wm-text-primary"
            style={{ fontSize: 14 }}
          >
            {dateLabel}
          </p>
        </div>
      </header>

      {/* eTrCard — Pencil `L8Emz` has cornerRadius 14 and a stroke
          declared with `thickness: 1` but no `fill` colour, which
          renders as no visible border. The card is just a centered
          container; the only painted surfaces are the sun-icon tile,
          the copy, and the "Add a task" button. */}
      <div
        className="flex flex-1 flex-col items-center justify-center"
        style={{
          gap: 18,
          padding: '36px 18px',
          borderRadius: 14,
        }}
      >
        {/* eTrIco — sun on dark tile. */}
        <div
          aria-hidden
          className="flex shrink-0 items-center justify-center"
          style={{
            width: 64,
            height: 64,
            borderRadius: 18,
            background: '#000000',
            border: '1px solid var(--color-wm-border)',
          }}
        >
          <Sun
            style={{ width: 28, height: 28, color: 'var(--color-wm-accent)' }}
          />
        </div>

        {/* eTrCpy — copy stack. */}
        <div
          className="flex w-full flex-col items-center text-center"
          style={{ gap: 8 }}
        >
          <p
            className="font-mono font-bold text-wm-text-primary"
            style={{ fontSize: 15 }}
          >
            Nothing on today.
          </p>
          <p
            className="font-mono font-medium"
            style={{ fontSize: 11, lineHeight: 1.6, color: '#999999' }}
          >
            No meetings, no due tasks. Add something or take the calm as a win.
          </p>
        </div>

        {/* eTrCta — ADD A TASK button. Pencil `R2H8ux` declares no
            fill at all (background removed in the latest design pass)
            and a stroke `{ thickness: 1 }` with no fill colour, which
            renders as no visible border. We honour both: transparent
            background, no border. */}
        <button
          type="button"
          onClick={onAddTask}
          className="flex w-full cursor-pointer items-center justify-center text-wm-text-primary transition-colors hover:bg-wm-surface-hover"
          style={{
            gap: 8,
            padding: '10px 14px',
            borderRadius: 10,
          }}
        >
          <Plus style={{ width: 13, height: 13 }} />
          <span
            className="font-mono font-bold uppercase"
            style={{ fontSize: 10, letterSpacing: 1.5 }}
          >
            Add a task
          </span>
        </button>
      </div>

      {/* eTrSec — COMING UP section. */}
      {comingUp.length > 0 && (
        <section className="flex flex-col" style={{ gap: 10 }}>
          <p
            className="font-mono font-bold uppercase"
            style={{ fontSize: 9, letterSpacing: 1.5, color: '#6e6e6e' }}
          >
            Coming up
          </p>
          {comingUp.slice(0, 3).map((event) => (
            <ComingUpRow key={event.id} event={event} now={now} />
          ))}
        </section>
      )}
    </aside>
  )
}

/**
 * One "COMING UP" row — Pencil `eTrU`.
 *   container: cornerRadius 10, bg #111111, 1px #1A1A1A border, padding
 *     [10, 12], gap 12, alignItems center.
 *   eTrUd 32×32 day chip with day-of-month.
 *   eTrUC col with "<title> · HH:MM" + relative-day caption.
 */
function ComingUpRow({ event, now }: { event: TodayEvent; now: Date }) {
  const start = new Date(event.startsAt)
  const dayNum = start.getDate()
  const time = start.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  })
  const relative = relativeDayLabel(now, start)
  return (
    <div
      className="flex items-center"
      style={{
        gap: 12,
        padding: '10px 12px',
        borderRadius: 10,
        background: '#111111',
        border: '1px solid var(--color-wm-border)',
      }}
    >
      <span
        aria-hidden
        className="flex shrink-0 items-center justify-center"
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          background: '#000000',
          border: '1px solid var(--color-wm-border)',
        }}
      >
        <span
          className="font-mono font-bold"
          style={{ fontSize: 11, color: '#999999' }}
        >
          {dayNum}
        </span>
      </span>
      <div className="flex min-w-0 flex-1 flex-col" style={{ gap: 2 }}>
        <span
          className="truncate font-mono font-medium text-wm-text-primary"
          style={{ fontSize: 11 }}
        >
          {event.title} · {time}
        </span>
        <span
          className="font-mono font-bold uppercase"
          style={{ fontSize: 9, letterSpacing: 1, color: '#6e6e6e' }}
        >
          {relative}
        </span>
      </div>
    </div>
  )
}

/**
 * "Tomorrow" / "Mon, Apr 28" / "In 5 days" relative caption used in
 * the COMING UP rows. Falls back to a localized weekday + date for
 * anything beyond a week out.
 */
function relativeDayLabel(now: Date, then: Date): string {
  const a = new Date(now)
  a.setHours(0, 0, 0, 0)
  const b = new Date(then)
  b.setHours(0, 0, 0, 0)
  const diffDays = Math.round((b.getTime() - a.getTime()) / 86_400_000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Tomorrow'
  if (diffDays > 1 && diffDays < 7) {
    return then.toLocaleDateString(undefined, { weekday: 'long' })
  }
  return then.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
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
