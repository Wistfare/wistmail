'use client'

import { useMemo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface MiniMonthProps {
  /** Anchor date — any day inside the month to render. */
  anchor: Date
  /** Currently selected day (rendered with lime fill). */
  selected?: Date
  /** Days that have at least one event (rendered with a small lime dot). */
  busyDays?: Date[]
  onPickDay?: (day: Date) => void
  onChangeMonth?: (delta: -1 | 1) => void
  className?: string
}

/**
 * Mini month-view picker rendered inside `CalendarSidebar`.
 *
 * Pencil reference: `CalendarV3` left panel mini-month (`gpSWG`).
 * Compact 7×6 grid with weekday header, today ringed in lime, selected
 * day filled lime, days outside the visible month dimmed.
 */
export function MiniMonth({
  anchor,
  selected,
  busyDays = [],
  onPickDay,
  onChangeMonth,
  className,
}: MiniMonthProps) {
  const monthLabel = anchor.toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  })
  const days = useMemo(() => buildCells(anchor), [anchor])
  const today = stripTime(new Date())
  const sel = selected ? stripTime(selected) : null
  const busy = useMemo(
    () => new Set(busyDays.map((d) => ymd(d))),
    [busyDays],
  )

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <header className="flex items-center justify-between">
        <span className="font-mono text-[11px] font-bold uppercase tracking-[1.5px] text-wm-text-secondary">
          {monthLabel}
        </span>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => onChangeMonth?.(-1)}
            className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-full text-wm-text-tertiary transition-colors hover:bg-wm-surface-hover hover:text-wm-text-primary"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            aria-label="Next month"
            onClick={() => onChangeMonth?.(1)}
            className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-full text-wm-text-tertiary transition-colors hover:bg-wm-surface-hover hover:text-wm-text-primary"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      <div className="grid grid-cols-7 gap-0.5 text-center">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <span
            key={i}
            className="font-mono text-[9px] font-semibold uppercase tracking-wider text-wm-text-muted"
          >
            {d}
          </span>
        ))}
        {days.map((d) => {
          const inMonth = d.getMonth() === anchor.getMonth()
          const isToday = d.getTime() === today.getTime()
          const isSelected = sel ? d.getTime() === sel.getTime() : false
          const isBusy = busy.has(ymd(d))
          return (
            <button
              key={d.toISOString()}
              type="button"
              onClick={() => onPickDay?.(d)}
              aria-pressed={isSelected}
              aria-label={d.toLocaleDateString()}
              className={cn(
                'relative mx-auto flex h-7 w-7 cursor-pointer items-center justify-center rounded-full font-mono text-[11px] transition-colors',
                isSelected
                  ? 'bg-wm-accent text-wm-text-on-accent'
                  : isToday
                    ? 'border border-wm-accent text-wm-accent'
                    : inMonth
                      ? 'text-wm-text-secondary hover:bg-wm-surface-hover hover:text-wm-text-primary'
                      : 'text-wm-text-muted hover:text-wm-text-tertiary',
              )}
            >
              {d.getDate()}
              {isBusy && !isSelected && (
                <span
                  aria-hidden
                  className="absolute bottom-0.5 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full bg-wm-accent"
                />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function buildCells(anchor: Date): Date[] {
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

function stripTime(d: Date): Date {
  const out = new Date(d)
  out.setHours(0, 0, 0, 0)
  return out
}

function ymd(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
