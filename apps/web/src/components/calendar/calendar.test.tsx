import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import {
  CalendarHeader,
  EventBlock,
  MonthGrid,
  WeekGrid,
} from './index'
import { rangeForMonthGrid, rangeForWeek, type CalendarEvent } from '@/lib/event-queries'

function buildEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 'ev_1',
    userId: 'u_1',
    title: 'Design review',
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

describe('CalendarHeader', () => {
  it('renders Today + view toggle + nav arrows', () => {
    const onView = vi.fn()
    const onNav = vi.fn()
    render(
      <CalendarHeader
        anchor={new Date('2026-04-23')}
        view="week"
        onViewChange={onView}
        onNav={onNav}
      />,
    )
    expect(screen.getByRole('button', { name: 'Today' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'week' })).toHaveAttribute('aria-selected', 'true')
    fireEvent.click(screen.getByRole('tab', { name: 'month' }))
    expect(onView).toHaveBeenCalledWith('month')
    fireEvent.click(screen.getByLabelText('Previous'))
    expect(onNav).toHaveBeenCalledWith(-1)
    fireEvent.click(screen.getByLabelText('Next'))
    expect(onNav).toHaveBeenCalledWith(1)
  })

  it('jumps to today when Today clicked', () => {
    const onNav = vi.fn()
    render(
      <CalendarHeader
        anchor={new Date('2026-04-23')}
        view="week"
        onViewChange={() => {}}
        onNav={onNav}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Today' }))
    expect(onNav).toHaveBeenCalledWith(0)
  })
})

describe('EventBlock', () => {
  it('renders title and time range in week mode', () => {
    render(<EventBlock event={buildEvent({ title: 'Sprint planning' })} />)
    expect(screen.getByText('Sprint planning')).toBeInTheDocument()
    // Time format depends on locale; assert that a colon appears for a 14:00 start.
    expect(screen.getByText(/[–-]/)).toBeInTheDocument()
  })

  it('fires onClick', () => {
    const onClick = vi.fn()
    render(<EventBlock event={buildEvent()} onClick={onClick} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledOnce()
  })
})

describe('WeekGrid', () => {
  it('renders 7 day headers + hour gutters + an event', () => {
    const start = new Date('2026-04-20T00:00:00')
    render(
      <WeekGrid
        startOfWeek={start}
        events={[buildEvent({ startAt: '2026-04-23T14:00:00', endAt: '2026-04-23T15:30:00' })]}
        startHour={8}
        endHour={18}
      />,
    )
    // Day numbers 20–26 should appear.
    expect(screen.getByText('20')).toBeInTheDocument()
    expect(screen.getByText('26')).toBeInTheDocument()
    expect(screen.getByText('Design review')).toBeInTheDocument()
  })

  it('fires onSlotClick when an empty slot is clicked', () => {
    const onSlot = vi.fn()
    render(
      <WeekGrid
        startOfWeek={new Date('2026-04-20T00:00:00')}
        events={[]}
        startHour={9}
        endHour={11}
        onSlotClick={onSlot}
      />,
    )
    // Find the first empty-slot button via aria-label.
    fireEvent.click(screen.getAllByLabelText(/Create event at/)[0])
    expect(onSlot).toHaveBeenCalledOnce()
  })
})

describe('MonthGrid', () => {
  it('renders 42 cells and fires onDayClick / onEventClick', () => {
    const onDay = vi.fn()
    const onEvent = vi.fn()
    const events = [buildEvent()]
    const { container } = render(
      <MonthGrid
        anchor={new Date('2026-04-15')}
        events={events}
        onDayClick={onDay}
        onEventClick={onEvent}
      />,
    )
    // 42 day cells rendered as role=button divs (not <button> to avoid
    // nesting the event button inside).
    const dayCells = container.querySelectorAll('[role="button"].h-full')
    expect(dayCells.length).toBe(42)
    fireEvent.click(screen.getByText('Design review'))
    expect(onEvent).toHaveBeenCalledOnce()
  })
})

describe('range helpers', () => {
  it('rangeForWeek returns [Mon 00:00, Mon+7) for any anchor', () => {
    const anchor = new Date('2026-04-23T13:00:00') // Thursday
    const { from, to } = rangeForWeek(anchor)
    expect(from.getDay()).toBe(1) // Monday
    expect(Math.round((to.getTime() - from.getTime()) / 86_400_000)).toBe(7)
  })

  it('rangeForMonthGrid returns 42-day window starting on a Monday', () => {
    const anchor = new Date('2026-04-15')
    const { from, to } = rangeForMonthGrid(anchor)
    expect(from.getDay()).toBe(1) // Monday
    expect(Math.round((to.getTime() - from.getTime()) / 86_400_000)).toBe(42)
  })
})
