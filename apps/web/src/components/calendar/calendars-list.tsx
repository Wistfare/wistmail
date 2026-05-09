'use client'

import { Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface CalendarOption {
  id: string
  name: string
  color: string
  /** When false, events with this color are hidden from the grid. */
  visible: boolean
}

export interface CalendarsListProps {
  calendars: CalendarOption[]
  onToggle: (id: string) => void
  onAdd?: () => void
  className?: string
}

/**
 * Toggleable calendar visibility list.
 *
 * Pencil reference: `CalendarV3` left-panel calendars list (`gpSWG`)
 * — colored checkbox + name. Tapping the checkbox flips visibility.
 *
 * The data model: today there's no `calendars` table on the backend.
 * `useDerivedCalendars()` (in `lib/calendar-derived.ts`) groups events
 * by color into pseudo-calendars, persisting visibility in localStorage
 * so the toggle has user-meaningful state across reloads.
 */
export function CalendarsList({
  calendars,
  onToggle,
  onAdd,
  className,
}: CalendarsListProps) {
  return (
    <section className={cn('flex flex-col gap-1', className)}>
      <header className="flex items-center justify-between pb-1">
        <span className="font-mono text-[10px] font-bold uppercase tracking-[1.5px] text-wm-text-tertiary">
          Calendars
        </span>
        {onAdd && (
          <button
            type="button"
            aria-label="Add calendar"
            onClick={onAdd}
            className="cursor-pointer text-wm-text-muted transition-colors hover:text-wm-text-secondary"
          >
            <Plus className="h-3 w-3" />
          </button>
        )}
      </header>
      {calendars.length === 0 ? (
        <p className="font-mono text-[11px] text-wm-text-muted">
          Events will be grouped here as you add them.
        </p>
      ) : (
        <ul className="flex flex-col">
          {calendars.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onToggle(c.id)}
                aria-pressed={c.visible}
                className={cn(
                  'flex w-full cursor-pointer items-center gap-2.5 rounded-md px-1.5 py-1.5 text-left transition-colors hover:bg-wm-surface-hover',
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border-2 transition-colors',
                  )}
                  style={{
                    borderColor: c.color,
                    backgroundColor: c.visible ? c.color : 'transparent',
                  }}
                >
                  {c.visible && (
                    <svg
                      className="h-2.5 w-2.5 text-wm-text-on-accent"
                      viewBox="0 0 24 24"
                      fill="none"
                    >
                      <path
                        d="M5 12l5 5 9-11"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </span>
                <span
                  className={cn(
                    'flex-1 truncate font-mono text-[12px]',
                    c.visible
                      ? 'text-wm-text-primary'
                      : 'text-wm-text-tertiary line-through',
                  )}
                >
                  {c.name}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
