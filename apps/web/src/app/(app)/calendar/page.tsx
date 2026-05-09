'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { Plus } from 'lucide-react'
import {
  CalendarHeader,
  DayGrid,
  EventComposer,
  MonthGrid,
  WeekGrid,
  type CalendarView,
} from '@/components/calendar'
import { Button } from '@/components/ui'
import {
  type CalendarEvent,
  rangeForMonthGrid,
  rangeForWeek,
  useEventsInRange,
} from '@/lib/event-queries'
import { useDerivedCalendars } from '@/lib/calendar-derived'

/**
 * `/calendar` — Pencil reference: `CalendarV3` (week, `gpSWG`),
 * `CalendarV3-Month` (`ghtzf`), and the day view derived by collapsing
 * the week grid into a single column.
 *
 * View is controlled by `?view=month|day` (week is the default), and the
 * anchor date is shared via `?date=YYYY-MM-DD` so the sidebar's
 * mini-month and other deep links can jump straight to a target day.
 */
export default function CalendarPage() {
  const search = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const view: CalendarView = (search.get('view') as CalendarView) || 'week'
  const dateParam = search.get('date')
  const anchor = useMemo<Date>(
    () => parseDateParam(dateParam) ?? stripTime(new Date()),
    [dateParam],
  )

  const [composerOpen, setComposerOpen] = useState(false)
  const [composerStart, setComposerStart] = useState<Date | undefined>()
  const [editing, setEditing] = useState<CalendarEvent | undefined>()

  // The sidebar's "+ NEW" CTA navigates here with `?compose=1` when no
  // explicit handler is wired. We pop the composer once and strip the
  // flag so refreshing the page doesn't reopen it.
  const composeFlag = search.get('compose')
  useEffect(() => {
    if (!composeFlag) return
    setComposerOpen(true)
    setEditing(undefined)
    setComposerStart(undefined)
    const params = new URLSearchParams(search.toString())
    params.delete('compose')
    const q = params.toString()
    router.replace(q ? `${pathname}?${q}` : pathname)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composeFlag])

  const range = useMemo(() => {
    if (view === 'month') return rangeForMonthGrid(anchor)
    if (view === 'week') return rangeForWeek(anchor)
    const from = new Date(anchor)
    from.setHours(0, 0, 0, 0)
    const to = new Date(from)
    to.setDate(to.getDate() + 1)
    return { from, to }
  }, [anchor, view])

  const events = useEventsInRange(range.from, range.to)
  const { filterEvents } = useDerivedCalendars(events.data)
  const visibleEvents = filterEvents(events.data)

  function setAnchor(next: Date) {
    const params = new URLSearchParams(search.toString())
    params.set('date', toDateParam(next))
    const q = params.toString()
    router.replace(q ? `${pathname}?${q}` : pathname)
  }

  function changeView(next: CalendarView) {
    const params = new URLSearchParams(search.toString())
    if (next === 'week') params.delete('view')
    else params.set('view', next)
    const q = params.toString()
    router.replace(q ? `${pathname}?${q}` : pathname)
  }

  function nav(direction: -1 | 0 | 1) {
    if (direction === 0) {
      setAnchor(stripTime(new Date()))
      return
    }
    const next = new Date(anchor)
    if (view === 'month') {
      next.setMonth(next.getMonth() + direction)
    } else if (view === 'week') {
      next.setDate(next.getDate() + 7 * direction)
    } else {
      next.setDate(next.getDate() + direction)
    }
    setAnchor(stripTime(next))
  }

  function openCreate(at?: Date) {
    setEditing(undefined)
    setComposerStart(at)
    setComposerOpen(true)
  }

  function openEdit(event: CalendarEvent) {
    setEditing(event)
    setComposerStart(undefined)
    setComposerOpen(true)
  }

  return (
    <div className="flex h-full flex-col">
      <CalendarHeader
        anchor={anchor}
        view={view}
        onViewChange={changeView}
        onNav={nav}
        actions={
          <Button icon={<Plus className="h-3.5 w-3.5" />} onClick={() => openCreate()}>
            New event
          </Button>
        }
      />

      <div className="flex-1 overflow-hidden">
        {events.isPending ? (
          <div className="flex h-full items-center justify-center">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-wm-accent border-t-transparent" />
          </div>
        ) : view === 'month' ? (
          <MonthGrid
            anchor={anchor}
            events={visibleEvents}
            onEventClick={openEdit}
            onDayClick={(d) => openCreate(combineWithMidday(d))}
          />
        ) : view === 'day' ? (
          <DayGrid
            day={anchor}
            events={visibleEvents}
            onEventClick={openEdit}
            onSlotClick={openCreate}
          />
        ) : (
          <WeekGrid
            startOfWeek={rangeForWeek(anchor).from}
            events={visibleEvents}
            onEventClick={openEdit}
            onSlotClick={openCreate}
          />
        )}
      </div>

      <EventComposer
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        event={editing}
        defaultStart={composerStart}
      />
    </div>
  )
}

function stripTime(d: Date): Date {
  const out = new Date(d)
  out.setHours(0, 0, 0, 0)
  return out
}

function combineWithMidday(d: Date): Date {
  const out = new Date(d)
  out.setHours(9, 0, 0, 0)
  return out
}

function parseDateParam(raw: string | null): Date | null {
  if (!raw) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(d.getTime()) ? null : d
}

function toDateParam(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
