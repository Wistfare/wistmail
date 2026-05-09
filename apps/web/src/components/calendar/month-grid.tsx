'use client'

import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import type { CalendarEvent } from '@/lib/event-queries'
import { EventBlock } from './event-block'

export interface MonthGridProps {
  /** Anchor date — any day inside the month to show. */
  anchor: Date
  events: CalendarEvent[]
  onEventClick?: (event: CalendarEvent) => void
  onDayClick?: (day: Date) => void
}

/**
 * 7×6 month grid (always 42 cells, weeks start Monday).
 * Pencil reference: `CalendarV3-Month` (`ghtzf`).
 */
export function MonthGrid({ anchor, events, onEventClick, onDayClick }: MonthGridProps) {
  const days = useMemo(() => buildMonthCells(anchor), [anchor])
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Index events by yyyy-mm-dd of start.
  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const e of events) {
      const key = ymd(new Date(e.startAt))
      const arr = map.get(key) ?? []
      arr.push(e)
      map.set(key, arr)
    }
    return map
  }, [events])

  return (
    <div className="flex h-full flex-col bg-wm-bg">
      <div className="grid grid-cols-7 border-b border-wm-border">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
          <div
            key={d}
            className="border-l border-wm-border py-2 text-center font-mono text-[10px] font-bold uppercase tracking-[1.5px] text-wm-text-tertiary first:border-l-0"
          >
            {d}
          </div>
        ))}
      </div>

      <div className="grid flex-1 grid-cols-7 grid-rows-6">
        {days.map((d) => {
          const inMonth = d.getMonth() === anchor.getMonth()
          const isToday = d.getTime() === today.getTime()
          const dayEvents = byDay.get(ymd(d)) ?? []
          // Day cell is a div (not button) so we can nest event buttons
          // inside without React warning about nested interactive elements.
          // Click handling is bound here; child event onClick handlers
          // stopPropagation implicitly because they're proper buttons.
          return (
            <div
              key={d.toISOString()}
              role="button"
              tabIndex={0}
              onClick={() => onDayClick?.(d)}
              onKeyDown={(ev) => {
                if (ev.key === 'Enter' || ev.key === ' ') {
                  ev.preventDefault()
                  onDayClick?.(d)
                }
              }}
              className={cn(
                'group flex h-full cursor-pointer flex-col items-stretch gap-1 overflow-hidden border-l border-t border-wm-border p-1.5 text-left transition-colors hover:bg-wm-surface-hover focus:outline-none focus-visible:ring-1 focus-visible:ring-wm-accent',
                !inMonth && 'opacity-40',
                isToday && 'bg-wm-accent-dim/40',
              )}
            >
              <span
                className={cn(
                  'inline-flex h-6 w-6 items-center justify-center self-end rounded-full font-mono text-[11px] font-bold',
                  isToday
                    ? 'bg-wm-accent text-wm-text-on-accent'
                    : 'text-wm-text-secondary',
                )}
              >
                {d.getDate()}
              </span>
              <div className="flex flex-col gap-0.5">
                {dayEvents.slice(0, 3).map((e) => (
                  <EventBlock
                    key={e.id}
                    event={e}
                    variant="month"
                    onClick={() => onEventClick?.(e)}
                  />
                ))}
                {dayEvents.length > 3 && (
                  <span className="px-1 font-mono text-[10px] text-wm-text-tertiary">
                    +{dayEvents.length - 3} more
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function buildMonthCells(anchor: Date): Date[] {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
  const startDow = (first.getDay() + 6) % 7 // Mon=0
  const start = new Date(first)
  start.setDate(first.getDate() - startDow)
  const out: Date[] = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    d.setHours(0, 0, 0, 0)
    out.push(d)
  }
  return out
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function pad(n: number): string {
  return n.toString().padStart(2, '0')
}
