'use client'

import Link from 'next/link'
import { CalendarDays, Video } from 'lucide-react'
import { cn, formatRelativeTime } from '@/lib/utils'
import type { CalendarEvent } from '@/lib/event-queries'

export interface MeetingListItemProps {
  href: string
  meeting: CalendarEvent
  active?: boolean
}

/**
 * V3 meeting list-row.
 *
 * Pencil reference: `MeetingsV3` (`RTarH`) left list. Color square +
 * title + relative time + duration line. Active row gets accent-dim
 * bg + 3-px lime left stroke.
 */
export function MeetingListItem({ href, meeting, active }: MeetingListItemProps) {
  const start = new Date(meeting.startAt)
  const end = new Date(meeting.endAt)
  const minutes = Math.round((end.getTime() - start.getTime()) / 60_000)
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group flex items-start gap-3 border-l-[3px] px-5 py-3 transition-colors',
        active
          ? 'border-l-wm-accent bg-wm-accent-dim'
          : 'border-l-transparent hover:bg-wm-surface-hover',
      )}
    >
      <span
        aria-hidden
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-wm-text-on-accent"
        style={{
          backgroundColor: meeting.color,
        }}
      >
        <Video className="h-4 w-4" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate font-sans text-[13px] font-semibold text-wm-text-primary">
          {meeting.title}
        </span>
        <span className="font-mono text-[11px] text-wm-text-tertiary">
          {start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
          {minutes > 0 ? ` · ${minutes} min` : ''}
        </span>
        <span className="flex items-center gap-1.5 font-mono text-[10px] text-wm-text-muted">
          <CalendarDays className="h-3 w-3" />
          {formatRelativeTime(start)}
        </span>
      </span>
    </Link>
  )
}
