import { beforeEach, describe, expect, it } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import { useDerivedCalendars } from './calendar-derived'
import type { CalendarEvent } from './event-queries'

// Wrap the hook in a QueryClientProvider — `useDerivedCalendars` now
// queries `/api/v1/calendar/calendars` as its primary source. The
// `enabled: false` default keeps that fetch from running so the hook
// falls back to its in-memory derivation, which is what these tests
// assert about.
function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, enabled: false } },
  })
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children)
}

function buildEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 'ev_1',
    userId: 'u_1',
    title: 'x',
    description: null,
    location: null,
    attendees: [],
    startAt: '2026-04-23T14:00:00Z',
    endAt: '2026-04-23T15:00:00Z',
    color: '#BFFF00',
    meetingLink: null,
    hasWaitingRoom: false,
    reminderMinutes: [15],
    notes: null,
    createdAt: '2026-04-20T00:00:00Z',
    updatedAt: '2026-04-20T00:00:00Z',
    ...overrides,
  }
}

describe('useDerivedCalendars', () => {
  beforeEach(() => {
    try {
      window.localStorage?.clear?.()
    } catch {
      // jsdom in this project may not always provide localStorage; the
      // hook itself swallows errors so we can ignore here too.
    }
  })

  it('derives calendars from event color frequency', () => {
    const events = [
      buildEvent({ id: 'a', color: '#BFFF00' }),
      buildEvent({ id: 'b', color: '#BFFF00' }),
      buildEvent({ id: 'c', color: '#A78BFA' }),
    ]
    const { result } = renderHook(() => useDerivedCalendars(events), {
      wrapper: makeWrapper(),
    })
    expect(result.current.calendars.length).toBe(2)
    // Most-frequent color first.
    expect(result.current.calendars[0].color).toBe('#BFFF00')
    expect(result.current.calendars[0].name).toBe('Personal')
    expect(result.current.calendars[1].name).toBe('Work')
  })

  it('toggles visibility and filters events accordingly', () => {
    const events = [
      buildEvent({ id: 'a', color: '#BFFF00' }),
      buildEvent({ id: 'b', color: '#A78BFA' }),
    ]
    const { result } = renderHook(() => useDerivedCalendars(events), {
      wrapper: makeWrapper(),
    })
    expect(result.current.filterEvents(events).length).toBe(2)

    act(() => {
      result.current.toggle('#A78BFA')
    })
    const visible = result.current.filterEvents(events)
    expect(visible.length).toBe(1)
    expect(visible[0].id).toBe('a')
    expect(result.current.calendars.find((c) => c.id === '#A78BFA')?.visible).toBe(false)
  })

  it('falls back to the hex when the color name is unknown', () => {
    const events = [buildEvent({ color: '#123456' })]
    const { result } = renderHook(() => useDerivedCalendars(events), {
      wrapper: makeWrapper(),
    })
    expect(result.current.calendars[0].name).toBe('#123456')
  })
})

