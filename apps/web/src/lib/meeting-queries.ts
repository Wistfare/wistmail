'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from './api-client'
import type { CalendarEvent } from './event-queries'

const KEY = ['meetings'] as const

/**
 * List of upcoming meetings — calendar events that have a meeting
 * link set. Backed by `GET /api/v1/calendar/events/meetings`.
 */
export function useMeetings() {
  return useQuery({
    queryKey: [...KEY],
    queryFn: () =>
      api
        .get<{ meetings: CalendarEvent[] }>('/api/v1/calendar/events/meetings')
        .then((r) => r.meetings),
    staleTime: 30_000,
  })
}

/** Single meeting via the standard event endpoint. */
export function useMeeting(id: string | null) {
  return useQuery({
    queryKey: [...KEY, 'detail', id],
    queryFn: () => api.get<CalendarEvent>(`/api/v1/calendar/events/${id}`),
    enabled: !!id,
  })
}

export type MeetingFilter = 'upcoming' | 'recent' | 'all'

/** Bucket the meeting list against `now` for the V3 tabs. */
export function useFilteredMeetings(filter: MeetingFilter) {
  const all = useMeetings()
  const filtered = useMemo(() => {
    const now = Date.now()
    const list = all.data ?? []
    if (filter === 'upcoming') {
      return list.filter((m) => new Date(m.startAt).getTime() >= now)
    }
    if (filter === 'recent') {
      return list.filter((m) => new Date(m.endAt).getTime() < now)
    }
    return list
  }, [all.data, filter])
  return { ...all, data: filtered }
}
