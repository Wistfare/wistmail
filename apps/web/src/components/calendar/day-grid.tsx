'use client'

import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import type { CalendarEvent } from '@/lib/event-queries'
import { EventBlock } from './event-block'

export interface DayGridProps {
  day: Date
  events: CalendarEvent[]
  startHour?: number
  endHour?: number
  hourHeight?: number
  onEventClick?: (event: CalendarEvent) => void
  onSlotClick?: (date: Date) => void
}

/**
 * Single-day timeline. Pencil derives this from `CalendarV3` (`gpSWG`)
 * by collapsing the 7-day grid into one column. Renders a wide event
 * column so titles + times don't truncate the way they do in the week
 * view's narrow columns.
 */
export function DayGrid({
  day,
  events,
  startHour = 0,
  endHour = 24,
  hourHeight = 56,
  onEventClick,
  onSlotClick,
}: DayGridProps) {
  const hours = useMemo(() => {
    const arr: number[] = []
    for (let h = startHour; h < endHour; h++) arr.push(h)
    return arr
  }, [startHour, endHour])

  const dayEvents = useMemo(
    () => events.filter((e) => sameDay(new Date(e.startAt), day)),
    [events, day],
  )
  const today = stripTime(new Date())
  const isToday = stripTime(day).getTime() === today.getTime()
  const gridHeight = hourHeight * (endHour - startHour)

  return (
    <div className="flex h-full flex-col bg-wm-bg">
      <header
        className={cn(
          'flex flex-col items-center justify-center gap-0.5 border-b border-wm-border py-3',
          isToday && 'bg-wm-accent-dim',
        )}
      >
        <span
          className={cn(
            'font-mono text-[10px] font-bold uppercase tracking-[1.5px]',
            isToday ? 'text-wm-accent' : 'text-wm-text-tertiary',
          )}
        >
          {day.toLocaleDateString(undefined, { weekday: 'long' })}
        </span>
        <span
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-full font-sans text-[18px] font-bold',
            isToday ? 'bg-wm-accent text-wm-text-on-accent' : 'text-wm-text-primary',
          )}
        >
          {day.getDate()}
        </span>
        <span className="font-mono text-[10px] text-wm-text-tertiary">
          {day.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
        </span>
      </header>

      <div className="relative flex-1 overflow-y-auto">
        <div
          className="grid grid-cols-[72px_1fr]"
          style={{ height: gridHeight }}
        >
          <div className="flex flex-col">
            {hours.map((h) => (
              <div
                key={h}
                className="flex justify-end pr-3 font-mono text-[10px] text-wm-text-tertiary"
                style={{ height: hourHeight }}
              >
                <span className="-mt-1.5">{formatHour(h)}</span>
              </div>
            ))}
          </div>

          <div className="relative border-l border-wm-border">
            {hours.map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => {
                  const at = new Date(day)
                  at.setHours(h, 0, 0, 0)
                  onSlotClick?.(at)
                }}
                aria-label={`Create event at ${formatHour(h)}`}
                className="block w-full cursor-pointer border-t border-wm-border first:border-t-transparent transition-colors hover:bg-wm-surface-hover"
                style={{ height: hourHeight }}
              />
            ))}

            {dayEvents.map((e) => {
              const top = positionTop(e.startAt, startHour, hourHeight)
              const height = positionHeight(e.startAt, e.endAt, hourHeight)
              return (
                <EventBlock
                  key={e.id}
                  event={e}
                  onClick={() => onEventClick?.(e)}
                  className="absolute left-2 right-2"
                  style={{ top, height: Math.max(28, height) }}
                />
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function stripTime(d: Date): Date {
  const out = new Date(d)
  out.setHours(0, 0, 0, 0)
  return out
}

function positionTop(iso: string, startHour: number, hourHeight: number): number {
  const d = new Date(iso)
  const minutes = (d.getHours() - startHour) * 60 + d.getMinutes()
  return (minutes / 60) * hourHeight
}

function positionHeight(startISO: string, endISO: string, hourHeight: number): number {
  const start = new Date(startISO)
  const end = new Date(endISO)
  const minutes = Math.max(15, (end.getTime() - start.getTime()) / 60_000)
  return (minutes / 60) * hourHeight
}

function formatHour(h: number): string {
  if (h === 0) return '12 AM'
  if (h === 12) return '12 PM'
  if (h > 12) return `${h - 12} PM`
  return `${h} AM`
}
