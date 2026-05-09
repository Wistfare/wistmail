'use client'

import { useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { SidebarShell, SidebarComposeButton } from './sidebar-shell'
import { CalendarsList, MiniMonth, UpNextCard } from '@/components/calendar'
import {
  rangeForMonthGrid,
  useEventsInRange,
  type CalendarEvent,
} from '@/lib/event-queries'
import { useDerivedCalendars } from '@/lib/calendar-derived'

export interface CalendarSidebarProps {
  user: { name: string; email: string }
  /** Click handler for the lime "+ NEW" CTA at the top. */
  onCreate?: () => void
  onUserMenu?: () => void
}

/**
 * V3 calendar left panel.
 *
 * Pencil reference: `CalendarV3` (`gpSWG`) — "+ NEW" CTA, mini-month
 * picker, calendars list with visibility toggles, "Up next" lime card
 * pinned at the bottom.
 *
 * The sidebar is decoupled from the page's date state via the URL —
 * picking a day in the mini-month writes `?date=YYYY-MM-DD` and the
 * page reacts via `useSearchParams()`. Same channel for the URL-shared
 * anchor that the in-page header uses.
 */
export function CalendarSidebar({ onCreate }: CalendarSidebarProps) {
  const router = useRouter()
  const pathname = usePathname()
  const search = useSearchParams()

  // Track a separate "month being browsed" inside the sidebar — the
  // mini-month chevrons should let the user scrub through months
  // without changing the main view's selected day.
  const dateParam = search.get('date')
  const selected = useMemo(() => parseDateParam(dateParam) ?? new Date(), [dateParam])
  const [browseAnchor, setBrowseAnchor] = useState<Date>(() => selected)

  // Pull the visible month's events for busy-day dots. We re-use the
  // page-level cache; TanStack Query dedupes by date-range key.
  const range = useMemo(() => rangeForMonthGrid(browseAnchor), [browseAnchor])
  const events = useEventsInRange(range.from, range.to)
  const { calendars, toggle } = useDerivedCalendars(events.data)

  const busyDays = useMemo(
    () => (events.data ?? []).map((e: CalendarEvent) => new Date(e.startAt)),
    [events.data],
  )

  // "Up next" — first event from now() onwards that isn't hidden by a
  // calendar toggle.
  const nextEvent = useMemo<CalendarEvent | null>(() => {
    const now = Date.now()
    const list = (events.data ?? [])
      .filter((e: CalendarEvent) => new Date(e.startAt).getTime() > now)
      .sort(
        (a: CalendarEvent, b: CalendarEvent) =>
          new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
      )
    return list[0] ?? null
  }, [events.data])

  function pickDay(day: Date) {
    const params = new URLSearchParams(search.toString())
    params.set('date', toDateParam(day))
    const q = params.toString()
    // If the user's browsing /calendar already, push a replace so the
    // back button doesn't accumulate a day per click. From elsewhere,
    // navigate fully.
    if (pathname === '/calendar') {
      router.replace(`/calendar?${q}`)
    } else {
      router.push(`/calendar?${q}`)
    }
    setBrowseAnchor(day)
  }

  function changeMonth(delta: -1 | 1) {
    const next = new Date(browseAnchor)
    next.setMonth(next.getMonth() + delta)
    setBrowseAnchor(next)
  }

  return (
    <SidebarShell
      cta={
        <SidebarComposeButton
          onClick={
            onCreate
              ? onCreate
              : () => {
                  // Bounce to the calendar route with a `compose=1` flag —
                  // the page reads that and pops the EventComposer once.
                  const params = new URLSearchParams(search.toString())
                  params.set('compose', '1')
                  router.push(`/calendar?${params.toString()}`)
                }
          }
        >
          New event
        </SidebarComposeButton>
      }
    >
      <div className="flex flex-col gap-5 px-1 pt-2">
        <MiniMonth
          anchor={browseAnchor}
          selected={selected}
          busyDays={busyDays}
          onPickDay={pickDay}
          onChangeMonth={changeMonth}
        />
        <CalendarsList calendars={calendars} onToggle={toggle} />
        {nextEvent && (
          <UpNextCard
            event={nextEvent}
            onJoin={(ev) => {
              if (ev.meetingLink) {
                window.open(ev.meetingLink, '_blank', 'noopener,noreferrer')
              }
            }}
          />
        )}
      </div>
    </SidebarShell>
  )
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
