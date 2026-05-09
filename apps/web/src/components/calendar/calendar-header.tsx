'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export type CalendarView = 'day' | 'week' | 'month'

export interface CalendarHeaderProps {
  /** Visible window anchor — start of week / first of month / arbitrary day. */
  anchor: Date
  view: CalendarView
  onViewChange: (v: CalendarView) => void
  onNav: (direction: -1 | 0 | 1) => void
  /** Optional right-side action (e.g. New event button). */
  actions?: React.ReactNode
}

/**
 * Top toolbar of the calendar page.
 *
 * Pencil reference: `CalendarV3` top bar (`gpSWG`):
 *   [Today]  Apr 21 – 27, 2026   [Day][Week][Month]  [<][>]
 */
export function CalendarHeader({ anchor, view, onViewChange, onNav, actions }: CalendarHeaderProps) {
  const label = formatRangeLabel(anchor, view)
  return (
    <header className="flex items-center justify-between gap-4 border-b border-wm-border bg-wm-bg px-6 py-4">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => onNav(0)}
          className="cursor-pointer rounded-full border border-wm-border px-3.5 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[1.5px] text-wm-text-secondary transition-colors hover:bg-wm-surface-hover hover:text-wm-text-primary"
        >
          Today
        </button>
        <h1 className="font-mono text-[20px] font-bold text-wm-text-primary">{label}</h1>
      </div>
      <div className="flex items-center gap-2">
        <ViewToggle value={view} onChange={onViewChange} />
        <div className="flex overflow-hidden rounded-full border border-wm-border">
          <button
            type="button"
            aria-label="Previous"
            onClick={() => onNav(-1)}
            className="flex h-8 w-9 cursor-pointer items-center justify-center text-wm-text-secondary transition-colors hover:bg-wm-surface-hover hover:text-wm-text-primary"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span aria-hidden className="w-px self-stretch bg-wm-border" />
          <button
            type="button"
            aria-label="Next"
            onClick={() => onNav(1)}
            className="flex h-8 w-9 cursor-pointer items-center justify-center text-wm-text-secondary transition-colors hover:bg-wm-surface-hover hover:text-wm-text-primary"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        {actions}
      </div>
    </header>
  )
}

function ViewToggle({ value, onChange }: { value: CalendarView; onChange: (v: CalendarView) => void }) {
  const opts: CalendarView[] = ['day', 'week', 'month']
  return (
    <div role="tablist" className="flex overflow-hidden rounded-full border border-wm-border">
      {opts.map((v, i) => {
        const active = v === value
        return (
          <button
            key={v}
            role="tab"
            aria-selected={active}
            type="button"
            onClick={() => onChange(v)}
            className={cn(
              'cursor-pointer px-3.5 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[1.5px] transition-colors',
              active
                ? 'bg-wm-accent text-wm-text-on-accent'
                : 'text-wm-text-secondary hover:bg-wm-surface-hover hover:text-wm-text-primary',
              i > 0 && 'border-l border-wm-border',
            )}
          >
            {v}
          </button>
        )
      })}
    </div>
  )
}

function formatRangeLabel(anchor: Date, view: CalendarView): string {
  if (view === 'month') {
    return anchor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  }
  if (view === 'day') {
    return anchor.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
  }
  // week
  const start = startOfWeek(anchor)
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  const sameMonth = start.getMonth() === end.getMonth()
  if (sameMonth) {
    return `${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${end.getDate()}, ${end.getFullYear()}`
  }
  return `${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${end.getFullYear()}`
}

function startOfWeek(d: Date): Date {
  const out = new Date(d)
  const dow = (out.getDay() + 6) % 7 // Mon=0
  out.setDate(out.getDate() - dow)
  out.setHours(0, 0, 0, 0)
  return out
}
