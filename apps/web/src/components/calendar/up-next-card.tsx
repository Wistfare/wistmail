'use client'

import { CalendarDays, Video } from 'lucide-react'
import type { CalendarEvent } from '@/lib/event-queries'

export interface UpNextCardProps {
  event: CalendarEvent | null
  onJoin?: (event: CalendarEvent) => void
}

/**
 * Lime-bordered "Up next" card rendered at the bottom of `CalendarSidebar`.
 *
 * Pencil reference: `CalendarV3` left-panel bottom card (`gpSWG`).
 * Renders nothing when there's no upcoming event.
 */
export function UpNextCard({ event, onJoin }: UpNextCardProps) {
  if (!event) return null
  const minutes = minutesUntil(event.startAt)
  const time = `${formatTime(event.startAt)} – ${formatTime(event.endAt)}`
  return (
    <article
      className="flex flex-col gap-2 rounded-xl border border-wm-accent bg-wm-accent-dim p-3"
      style={{ boxShadow: '0 6px 20px 0 rgba(191,255,0,0.12)' }}
    >
      <header className="flex items-center justify-between">
        <span className="font-mono text-[9px] font-bold uppercase tracking-[1.5px] text-wm-accent">
          Up next · in {minutes} min
        </span>
        {event.meetingLink && <Video className="h-3.5 w-3.5 text-wm-accent" />}
      </header>
      <h4 className="font-sans text-[13px] font-semibold leading-tight text-wm-text-primary">
        {event.title}
      </h4>
      <p className="flex items-center gap-1.5 font-mono text-[11px] text-wm-text-secondary">
        <CalendarDays className="h-3 w-3" />
        {time}
      </p>
      {(event.meetingLink || onJoin) && (
        <button
          type="button"
          onClick={() => onJoin?.(event)}
          className="mt-1 flex h-9 w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-wm-accent font-mono text-[11px] font-bold uppercase tracking-[1.5px] text-wm-text-on-accent transition-colors hover:bg-wm-accent-hover"
        >
          <Video className="h-3.5 w-3.5" />
          Join meeting
        </button>
      )}
    </article>
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
