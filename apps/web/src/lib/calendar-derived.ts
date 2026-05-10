'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from './api-client'
import type { CalendarEvent } from './event-queries'

const STORAGE_KEY = 'wm:calendar-visibility:v1'

interface ServerCalendar {
  id: string
  name: string
  color: string
  eventCount: number
}

/**
 * Server-side calendars list. The current schema has no `calendars`
 * table — the API derives the list by grouping events by colour and
 * always surfaces a "Personal" default for brand-new users. The
 * sidebar's `useDerivedCalendars` hook merges this when available,
 * falling back to the in-memory derivation otherwise.
 */
export function useCalendars() {
  return useQuery({
    queryKey: ['calendar', 'calendars'],
    queryFn: () =>
      api
        .get<{ calendars: ServerCalendar[] }>('/api/v1/calendar/calendars')
        .then((r) => r.calendars),
    staleTime: 60_000,
  })
}

/** Friendly name for a hex color. Falls back to the hex when unknown. */
function nameForColor(hex: string): string {
  const map: Record<string, string> = {
    '#BFFF00': 'Personal',
    '#A78BFA': 'Work',
    '#F59E0B': 'Travel',
    '#3B82F6': 'Updates',
    '#EC4899': 'Social',
    '#22D3EE': 'Health',
    '#FF4444': 'Holidays',
  }
  return map[hex.toUpperCase()] ?? hex
}

export interface DerivedCalendar {
  id: string
  name: string
  color: string
  visible: boolean
}

/**
 * Derive a list of pseudo-calendars from the event color palette in use.
 * Persists visibility flags in localStorage so toggle state survives
 * page reloads.
 *
 * Prefers the server's `/api/v1/calendar/calendars` aggregator (which
 * also surfaces a "Personal" default for brand-new users) when its
 * data has loaded; otherwise falls back to grouping the in-memory
 * event list by colour.
 */
export function useDerivedCalendars(events: CalendarEvent[] | undefined) {
  const server = useCalendars()
  const colors = useMemo(() => {
    if (server.data && server.data.length > 0) {
      return server.data.map((c) => c.color)
    }
    const set = new Map<string, number>()
    for (const e of events ?? []) {
      set.set(e.color, (set.get(e.color) ?? 0) + 1)
    }
    return Array.from(set.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([color]) => color)
  }, [events, server.data])

  const [hidden, setHidden] = useState<Set<string>>(() => new Set())

  // Hydrate from localStorage on mount.
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const arr = JSON.parse(raw) as string[]
      setHidden(new Set(arr))
    } catch {
      // ignore — fall through to default visibility.
    }
  }, [])

  // Persist whenever toggles change.
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(Array.from(hidden)),
      )
    } catch {
      // ignore — quota or private mode.
    }
  }, [hidden])

  const calendars: DerivedCalendar[] = useMemo(
    () =>
      colors.map((c) => ({
        id: c,
        name: nameForColor(c),
        color: c,
        visible: !hidden.has(c),
      })),
    [colors, hidden],
  )

  function toggle(id: string) {
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  /** Filter the event list against the current visibility flags. */
  function filterEvents(list: CalendarEvent[] | undefined): CalendarEvent[] {
    if (!list) return []
    if (hidden.size === 0) return list
    return list.filter((e) => !hidden.has(e.color))
  }

  return { calendars, toggle, filterEvents }
}
