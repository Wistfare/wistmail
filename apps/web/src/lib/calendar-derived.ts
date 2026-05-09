'use client'

import { useEffect, useMemo, useState } from 'react'
import type { CalendarEvent } from './event-queries'

const STORAGE_KEY = 'wm:calendar-visibility:v1'

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
 * When a real `/api/v1/calendar/calendars` table ships, swap this hook
 * for a `useCalendars()` query — `CalendarSidebar` doesn't care which.
 */
export function useDerivedCalendars(events: CalendarEvent[] | undefined) {
  const colors = useMemo(() => {
    const set = new Map<string, number>()
    for (const e of events ?? []) {
      set.set(e.color, (set.get(e.color) ?? 0) + 1)
    }
    return Array.from(set.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([color]) => color)
  }, [events])

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
