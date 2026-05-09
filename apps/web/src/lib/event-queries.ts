'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './api-client'

export interface CalendarEvent {
  id: string
  userId: string
  title: string
  description: string | null
  location: string | null
  attendees: string[]
  startAt: string
  endAt: string
  color: string
  meetingLink: string | null
  hasWaitingRoom: boolean
  reminderMinutes: number[]
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface EventInput {
  title: string
  description?: string
  location?: string
  attendees?: string[]
  startAt: string
  endAt: string
  color?: string
  meetingLink?: string | null
  hasWaitingRoom?: boolean
  reminderMinutes?: number[]
  notes?: string
}

const KEY = ['calendar', 'events'] as const

/**
 * Range-bounded events list. Re-fetches whenever the window changes.
 * Server returns rows in `{ events: [...] }` (see calendar.ts route).
 */
export function useEventsInRange(from: Date, to: Date) {
  return useQuery({
    queryKey: [...KEY, from.toISOString(), to.toISOString()],
    queryFn: async () => {
      const url = `/api/v1/calendar/events?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`
      const res = await api.get<{ events: CalendarEvent[] }>(url)
      return res.events
    },
    staleTime: 60_000,
  })
}

export function useEvent(id: string | null) {
  return useQuery({
    queryKey: [...KEY, 'detail', id],
    queryFn: () => api.get<CalendarEvent>(`/api/v1/calendar/events/${id}`),
    enabled: !!id,
  })
}

export function useCreateEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: EventInput) =>
      api.post<CalendarEvent>('/api/v1/calendar/events', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

export function useUpdateEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...patch }: Partial<EventInput> & { id: string }) =>
      api.patch<CalendarEvent>(`/api/v1/calendar/events/${id}`, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

export function useDeleteEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api.delete<{ ok: true }>(`/api/v1/calendar/events/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

/**
 * Build a `[startOfWeek, endOfWeek)` range.
 * Week starts on Monday — Pencil reference: `CalendarV3` shows Monday at the
 * leftmost column. To switch to Sunday-first, change `delta` below.
 */
export function rangeForWeek(anchor: Date): { from: Date; to: Date } {
  const d = new Date(anchor)
  const dayOfWeek = d.getDay() // 0=Sun, 1=Mon, ...
  const delta = (dayOfWeek + 6) % 7 // Mon=0, Sun=6
  const from = new Date(d.getFullYear(), d.getMonth(), d.getDate() - delta)
  const to = new Date(from)
  to.setDate(from.getDate() + 7)
  return { from, to }
}

/** Range covering the visible month grid (always 6 weeks / 42 cells). */
export function rangeForMonthGrid(anchor: Date): { from: Date; to: Date } {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
  const startDow = (first.getDay() + 6) % 7
  const from = new Date(first)
  from.setDate(first.getDate() - startDow)
  const to = new Date(from)
  to.setDate(from.getDate() + 42)
  return { from, to }
}
