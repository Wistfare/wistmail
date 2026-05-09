'use client'

import { Sparkles, Video } from 'lucide-react'
import { cn, formatRelativeTime } from '@/lib/utils'

export interface TodayFlowMeeting {
  id: string
  title: string
  startsAt: string
  endsAt?: string | null
  meetingLink?: string | null
}

export interface TodayFlowPanelProps {
  /**
   * "2h 14m focus" headline value. Computed by the parent so this
   * component stays a pure presentation layer.
   */
  focusLabel?: string
  /** Smaller subtitle under the focus stat. */
  focusHint?: string
  meetings: TodayFlowMeeting[]
  /** Optional AI nudge rendered at the bottom. */
  aiBrief?: React.ReactNode
  onJoinMeeting?: (m: TodayFlowMeeting) => void
  className?: string
}

/**
 * Right rail rendered on the WorkV3 "My day" page.
 *
 * Pencil reference: `WorkV3.todayFlow` (`QAyVs`) — focus stat at the
 * top, meetings list in the middle, AI assist note at the bottom.
 */
export function TodayFlowPanel({
  focusLabel = '0h 0m focus',
  focusHint = 'Hours blocked off so far today',
  meetings,
  aiBrief,
  onJoinMeeting,
  className,
}: TodayFlowPanelProps) {
  return (
    <aside
      className={cn(
        'flex w-[300px] shrink-0 flex-col gap-5 border-l border-wm-border bg-wm-bg p-5',
        className,
      )}
    >
      <header className="flex flex-col gap-1">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[1.5px] text-wm-text-tertiary">
          Today&rsquo;s flow
        </p>
        <h2 className="font-mono text-2xl font-bold text-wm-accent">
          {focusLabel}
        </h2>
        <p className="font-mono text-[10px] text-wm-text-tertiary">{focusHint}</p>
      </header>

      <section className="flex flex-col gap-1.5">
        <header className="flex items-center justify-between pb-1">
          <span className="font-mono text-[10px] font-bold uppercase tracking-[1.5px] text-wm-text-tertiary">
            Meetings
          </span>
          <span className="font-mono text-[10px] text-wm-text-muted">
            {meetings.length}
          </span>
        </header>
        {meetings.length === 0 ? (
          <p className="rounded-md border border-dashed border-wm-border px-3 py-4 text-center font-mono text-[11px] text-wm-text-muted">
            No meetings on the calendar today.
          </p>
        ) : (
          meetings.map((m) => (
            <article
              key={m.id}
              className="flex items-start gap-3 border-b border-wm-border py-2 last:border-b-0"
            >
              <span className="w-12 shrink-0 font-mono text-[11px] text-wm-text-tertiary">
                {formatTime(m.startsAt)}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate font-sans text-[12px] font-medium text-wm-text-primary">
                  {m.title}
                </span>
                <span className="font-mono text-[10px] text-wm-text-tertiary">
                  {formatRelativeTime(new Date(m.startsAt))}
                </span>
              </div>
              {m.meetingLink && onJoinMeeting && (
                <button
                  type="button"
                  onClick={() => onJoinMeeting(m)}
                  aria-label={`Join ${m.title}`}
                  className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-wm-accent text-wm-text-on-accent transition-colors hover:bg-wm-accent-hover"
                >
                  <Video className="h-3.5 w-3.5" />
                </button>
              )}
            </article>
          ))
        )}
      </section>

      {aiBrief && (
        <section className="rounded-xl border border-wm-accent/40 bg-wm-accent-dim/60 p-3.5">
          <header className="mb-2 flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[1.5px] text-wm-accent">
            <Sparkles className="h-3 w-3" />
            AI assist
          </header>
          <div className="font-mono text-[11.5px] leading-[1.55] text-wm-text-primary">
            {aiBrief}
          </div>
        </section>
      )}
    </aside>
  )
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })
}
