'use client'

import { cn } from '@/lib/utils'
import type { CalendarEvent } from '@/lib/event-queries'

export interface EventBlockProps {
  event: CalendarEvent
  variant?: 'week' | 'month'
  /** Override styles when rendered as next-up / featured event. */
  highlighted?: boolean
  onClick?: () => void
  className?: string
  style?: React.CSSProperties
}

/**
 * Colored event block. Pencil reference: `CalendarV3` event chips —
 * cornerRadius 6, rounded squares with title + time stacked, the
 * background is the event's `color` at 18% opacity with the title in
 * the full color.
 */
export function EventBlock({ event, variant = 'week', highlighted, onClick, className, style }: EventBlockProps) {
  const time = formatRange(event.startAt, event.endAt)
  const inlineStyles: React.CSSProperties = {
    ...style,
    backgroundColor: highlighted
      ? event.color
      : `${event.color}26`,
    borderColor: event.color,
    color: highlighted ? '#000000' : event.color,
  }
  return (
    <button
      type="button"
      onClick={onClick}
      style={inlineStyles}
      className={cn(
        'group flex w-full cursor-pointer flex-col gap-0.5 overflow-hidden rounded-md border border-l-[3px] px-2 py-1 text-left transition-opacity hover:opacity-90',
        variant === 'month' && 'flex-row items-center gap-1.5 rounded-sm py-px',
        className,
      )}
    >
      <span
        className={cn(
          'truncate font-sans text-[11px] font-semibold leading-tight',
          highlighted ? 'text-black' : '',
        )}
      >
        {event.title}
      </span>
      {variant === 'week' && (
        <span
          className={cn(
            'truncate font-mono text-[10px] leading-tight',
            highlighted ? 'text-black/70' : 'opacity-80',
          )}
        >
          {time}
        </span>
      )}
    </button>
  )
}

function formatRange(startISO: string, endISO: string): string {
  const fmt = (d: Date) =>
    d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  return `${fmt(new Date(startISO))} – ${fmt(new Date(endISO))}`
}
