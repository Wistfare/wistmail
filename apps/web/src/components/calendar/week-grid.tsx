'use client'

import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import type { CalendarEvent } from '@/lib/event-queries'
import { EventBlock } from './event-block'

export interface WeekGridProps {
  /** First day rendered (Monday by convention). */
  startOfWeek: Date
  events: CalendarEvent[]
  /** Hour rows shown. Defaults to 0 → 24. */
  startHour?: number
  endHour?: number
  /** Pixels per hour (controls overall grid height). */
  hourHeight?: number
  onEventClick?: (event: CalendarEvent) => void
  /** Click on an empty time slot — useful for "Create event" affordance. */
  onSlotClick?: (date: Date) => void
}

const DAYS = 7

/**
 * 7-column × 24-row time grid. Pencil reference: `CalendarV3` (`gpSWG`).
 *
 * Events absolutely-positioned within each day column based on their
 * `startAt` / `endAt`. We don't try to handle multi-day events yet — they
 * render only on their start day; the design doesn't show a multi-day
 * stack header band.
 */
export function WeekGrid({
  startOfWeek,
  events,
  startHour = 0,
  endHour = 24,
  hourHeight = 48,
  onEventClick,
  onSlotClick,
}: WeekGridProps) {
  const days = useMemo(() => {
    const arr: Date[] = []
    for (let i = 0; i < DAYS; i++) {
      const d = new Date(startOfWeek)
      d.setHours(0, 0, 0, 0)
      d.setDate(d.getDate() + i)
      arr.push(d)
    }
    return arr
  }, [startOfWeek])

  const hours = useMemo(() => {
    const arr: number[] = []
    for (let h = startHour; h < endHour; h++) arr.push(h)
    return arr
  }, [startHour, endHour])

  const gridHeight = hourHeight * (endHour - startHour)
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  function eventsForDay(day: Date): CalendarEvent[] {
    return events.filter((e) => sameDay(new Date(e.startAt), day))
  }

  return (
    <div className="flex h-full flex-col bg-wm-bg">
      {/* Day headers */}
      <div className="grid grid-cols-[64px_repeat(7,1fr)] border-b border-wm-border">
        <div aria-hidden />
        {days.map((d) => {
          const isToday = d.getTime() === today.getTime()
          return (
            <div
              key={d.toISOString()}
              className={cn(
                'flex flex-col items-center justify-center gap-0.5 border-l border-wm-border py-2',
                isToday && 'bg-wm-accent-dim',
              )}
            >
              <span
                className={cn(
                  'font-mono text-[10px] font-bold uppercase tracking-[1.5px]',
                  isToday ? 'text-wm-accent' : 'text-wm-text-tertiary',
                )}
              >
                {d.toLocaleDateString(undefined, { weekday: 'short' })}
              </span>
              <span
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-full font-sans text-[14px] font-bold',
                  isToday
                    ? 'bg-wm-accent text-wm-text-on-accent'
                    : 'text-wm-text-primary',
                )}
              >
                {d.getDate()}
              </span>
            </div>
          )
        })}
      </div>

      {/* Time grid */}
      <div className="relative flex-1 overflow-y-auto">
        <div className="grid grid-cols-[64px_repeat(7,1fr)]" style={{ height: gridHeight }}>
          {/* Hour gutters */}
          <div className="flex flex-col">
            {hours.map((h) => (
              <div
                key={h}
                className="flex justify-end pr-2 font-mono text-[10px] text-wm-text-tertiary"
                style={{ height: hourHeight }}
              >
                <span className="-mt-1.5">{formatHour(h)}</span>
              </div>
            ))}
          </div>

          {/* Day columns */}
          {days.map((day) => {
            const dayEvents = eventsForDay(day)
            return (
              <div
                key={day.toISOString()}
                className="relative border-l border-wm-border"
              >
                {/* Hour separators */}
                {hours.map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => {
                      const at = new Date(day)
                      at.setHours(h, 0, 0, 0)
                      onSlotClick?.(at)
                    }}
                    className="block w-full cursor-pointer border-t border-wm-border first:border-t-transparent transition-colors hover:bg-wm-surface-hover"
                    style={{ height: hourHeight }}
                    aria-label={`Create event at ${formatHour(h)}`}
                  />
                ))}

                {/* Events */}
                {dayEvents.map((e) => {
                  const top = positionTop(e.startAt, startHour, hourHeight)
                  const height = positionHeight(e.startAt, e.endAt, hourHeight)
                  return (
                    <EventBlock
                      key={e.id}
                      event={e}
                      onClick={() => onEventClick?.(e)}
                      className="absolute left-1 right-1"
                      style={{ top, height: Math.max(20, height) }}
                    />
                  )
                })}
              </div>
            )
          })}
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
  if (h === 0) return ''
  if (h === 12) return '12 PM'
  if (h > 12) return `${h - 12} PM`
  return `${h} AM`
}
