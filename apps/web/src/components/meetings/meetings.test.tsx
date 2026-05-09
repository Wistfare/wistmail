import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MeetingHeroCard, MeetingListItem } from './index'
import type { CalendarEvent } from '@/lib/event-queries'

function buildMeeting(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 'm_1',
    userId: 'u_1',
    title: 'Design review with Sarah',
    description: null,
    location: 'Conference room A',
    attendees: ['sarah@example.com', 'alex@example.com'],
    startAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    endAt: new Date(Date.now() + 90 * 60_000).toISOString(),
    color: '#BFFF00',
    meetingLink: 'https://meet.example.com/abc',
    hasWaitingRoom: true,
    reminderMinutes: [15],
    notes: null,
    createdAt: '2026-04-20T00:00:00Z',
    updatedAt: '2026-04-20T00:00:00Z',
    ...overrides,
  }
}

describe('MeetingListItem', () => {
  it('renders title + duration line + relative time', () => {
    render(
      <MeetingListItem href="/meetings/m_1" meeting={buildMeeting({ title: 'Sprint planning' })} />,
    )
    expect(screen.getByText('Sprint planning')).toBeInTheDocument()
    expect(screen.getByText(/min/)).toBeInTheDocument()
  })

  it('marks active state', () => {
    render(
      <MeetingListItem href="/meetings/m_1" meeting={buildMeeting()} active />,
    )
    expect(screen.getByRole('link')).toHaveAttribute('aria-current', 'page')
  })
})

describe('MeetingHeroCard', () => {
  it('renders the empty state when no meeting is supplied', () => {
    render(<MeetingHeroCard meeting={null} />)
    expect(screen.getByText(/Pick a meeting/)).toBeInTheDocument()
  })

  it('renders title, time, attendees, and a Join button when meetingLink is set', () => {
    const onJoin = vi.fn()
    render(<MeetingHeroCard meeting={buildMeeting()} onJoin={onJoin} />)
    expect(screen.getByText('Design review with Sarah')).toBeInTheDocument()
    expect(screen.getByText('sarah@example.com')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Join meeting/ }))
    expect(onJoin).toHaveBeenCalledOnce()
  })

  it('shows the disabled "No join link" state when meetingLink is null', () => {
    render(
      <MeetingHeroCard meeting={buildMeeting({ meetingLink: null, hasWaitingRoom: false })} />,
    )
    const btn = screen.getByRole('button', { name: /No join link/ })
    expect(btn).toBeDisabled()
  })

  it('renders the waiting-room badge when enabled', () => {
    render(<MeetingHeroCard meeting={buildMeeting({ hasWaitingRoom: true })} />)
    expect(screen.getByText('Waiting room')).toBeInTheDocument()
  })
})
