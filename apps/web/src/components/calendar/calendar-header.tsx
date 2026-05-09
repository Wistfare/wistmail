'use client'

import { ChevronLeft, ChevronRight, SlidersHorizontal } from 'lucide-react'
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
 * Top toolbar of the calendar page — Pencil reference: `CalendarV3.toolbar`
 * (`RnWtK`).
 *
 *   container: padding [16, 28], 1px bottom hairline #1A1A1A, justify between
 *   tL (gap 14):
 *     "TODAY" pill — radius 18, padding [8,14], bg #111111, 1px #1A1A1A
 *       border, 11/700 white tracking 1
 *     navWrap (gap 4):
 *       32×32 round-square (radius 8) chevron-left / chevron-right
 *       (icon 14 #999999, fill #111111)
 *     "Apr 21 — 27, 2026" 18/700 white
 *   tR (gap 6):
 *     viewG segment — radius 10, bg #111111, 1px #1A1A1A border, padding 3,
 *       gap 2.  Inner pills radius 7, padding [6,12], 10/700 tracking 1.
 *       active pill = lime fill, black label.
 *     32×32 round-square sliders-horizontal "moreBtn".
 */
export function CalendarHeader({
  anchor,
  view,
  onViewChange,
  onNav,
  actions,
}: CalendarHeaderProps) {
  const label = formatRangeLabel(anchor, view)
  return (
    <header
      className="flex w-full items-center justify-between"
      style={{
        padding: '16px 28px',
        borderBottom: '1px solid var(--color-wm-border)',
      }}
    >
      <div className="flex items-center" style={{ gap: 14 }}>
        <button
          type="button"
          onClick={() => onNav(0)}
          className="cursor-pointer bg-wm-surface text-wm-text-primary transition-colors hover:bg-wm-surface-hover"
          style={{
            padding: '8px 14px',
            borderRadius: 18,
            border: '1px solid var(--color-wm-border)',
          }}
        >
          <span
            className="font-mono font-bold uppercase"
            style={{ fontSize: 11, letterSpacing: 1 }}
          >
            Today
          </span>
        </button>
        <div className="flex items-center" style={{ gap: 4 }}>
          <NavBtn label="Previous" onClick={() => onNav(-1)}>
            <ChevronLeft style={{ width: 14, height: 14 }} />
          </NavBtn>
          <NavBtn label="Next" onClick={() => onNav(1)}>
            <ChevronRight style={{ width: 14, height: 14 }} />
          </NavBtn>
        </div>
        <h1
          className="font-mono font-bold text-wm-text-primary"
          style={{ fontSize: 18 }}
        >
          {label}
        </h1>
      </div>
      <div className="flex items-center" style={{ gap: 6 }}>
        <ViewToggle value={view} onChange={onViewChange} />
        {actions}
        <button
          type="button"
          aria-label="Calendar options"
          className="flex cursor-pointer items-center justify-center bg-wm-surface text-wm-text-secondary transition-colors hover:bg-wm-surface-hover hover:text-wm-text-primary"
          style={{ width: 32, height: 32, borderRadius: 8 }}
        >
          <SlidersHorizontal style={{ width: 14, height: 14 }} />
        </button>
      </div>
    </header>
  )
}

function NavBtn({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex cursor-pointer items-center justify-center bg-wm-surface text-wm-text-secondary transition-colors hover:bg-wm-surface-hover hover:text-wm-text-primary"
      style={{ width: 32, height: 32, borderRadius: 8 }}
    >
      {children}
    </button>
  )
}

function ViewToggle({
  value,
  onChange,
}: {
  value: CalendarView
  onChange: (v: CalendarView) => void
}) {
  const opts: CalendarView[] = ['day', 'week', 'month']
  return (
    <div
      role="tablist"
      className="flex items-center"
      style={{
        gap: 2,
        padding: 3,
        background: '#111111',
        borderRadius: 10,
        border: '1px solid var(--color-wm-border)',
      }}
    >
      {opts.map((v) => {
        const active = v === value
        return (
          <button
            key={v}
            role="tab"
            aria-selected={active}
            type="button"
            onClick={() => onChange(v)}
            className={cn(
              'cursor-pointer font-mono font-bold uppercase transition-colors',
              active
                ? 'bg-wm-accent text-wm-text-on-accent'
                : 'text-wm-text-secondary hover:bg-wm-surface-hover hover:text-wm-text-primary',
            )}
            style={{
              padding: '6px 12px',
              borderRadius: 7,
              fontSize: 10,
              letterSpacing: 1,
            }}
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
    return anchor.toLocaleDateString(undefined, {
      month: 'long',
      year: 'numeric',
    })
  }
  if (view === 'day') {
    return anchor.toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    })
  }
  // week
  const start = startOfWeek(anchor)
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  const sameMonth = start.getMonth() === end.getMonth()
  if (sameMonth) {
    return `${start.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    })} – ${end.getDate()}, ${end.getFullYear()}`
  }
  return `${start.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })} – ${end.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })}, ${end.getFullYear()}`
}

function startOfWeek(d: Date): Date {
  const out = new Date(d)
  const dow = (out.getDay() + 6) % 7 // Mon=0
  out.setDate(out.getDate() - dow)
  out.setHours(0, 0, 0, 0)
  return out
}
