import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import {
  CalendarsList,
  DayGrid,
  MiniMonth,
  UpNextCard,
  type CalendarOption,
} from './index'
import type { CalendarEvent } from '@/lib/event-queries'

function buildEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 'ev_1',
    userId: 'u_1',
    title: 'Design review',
    description: null,
    location: null,
    attendees: [],
    startAt: '2026-04-23T14:00:00',
    endAt: '2026-04-23T15:00:00',
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

describe('MiniMonth', () => {
  it('renders the month label and 6 weeks of cells', () => {
    const { container } = render(
      <MiniMonth anchor={new Date('2026-04-15')} />,
    )
    // Month + year label.
    expect(screen.getByText(/April 2026/)).toBeInTheDocument()
    // 7 weekday headers + 42 day cells.
    const dayCells = container.querySelectorAll('button[aria-label]')
    expect(dayCells.length).toBeGreaterThanOrEqual(42)
  })

  it('fires onPickDay when a day cell is clicked', () => {
    const onPick = vi.fn()
    render(<MiniMonth anchor={new Date('2026-04-15')} onPickDay={onPick} />)
    fireEvent.click(screen.getByRole('button', { name: '4/15/2026' }))
    expect(onPick).toHaveBeenCalledOnce()
  })

  it('fires onChangeMonth when arrow buttons are clicked', () => {
    const onChange = vi.fn()
    render(
      <MiniMonth anchor={new Date('2026-04-15')} onChangeMonth={onChange} />,
    )
    fireEvent.click(screen.getByLabelText('Previous month'))
    expect(onChange).toHaveBeenCalledWith(-1)
    fireEvent.click(screen.getByLabelText('Next month'))
    expect(onChange).toHaveBeenCalledWith(1)
  })

  it('marks busy days with a dot', () => {
    const { container } = render(
      <MiniMonth
        anchor={new Date('2026-04-15')}
        busyDays={[new Date('2026-04-15')]}
      />,
    )
    // The busy-day dot is a span with bg-wm-accent — grab any matching child.
    const dots = container.querySelectorAll('.bg-wm-accent')
    expect(dots.length).toBeGreaterThan(0)
  })
})

describe('UpNextCard', () => {
  it('renders nothing when there is no event', () => {
    const { container } = render(<UpNextCard event={null} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders title and time when an event is supplied', () => {
    const future = new Date(Date.now() + 30 * 60_000)
    const ends = new Date(future.getTime() + 60 * 60_000)
    render(
      <UpNextCard
        event={buildEvent({
          title: 'All-hands',
          startAt: future.toISOString(),
          endAt: ends.toISOString(),
        })}
      />,
    )
    expect(screen.getByText('All-hands')).toBeInTheDocument()
    expect(screen.getByText(/Up next · in/)).toBeInTheDocument()
  })

  it('fires onJoin when the Join meeting button is clicked', () => {
    const onJoin = vi.fn()
    const future = new Date(Date.now() + 30 * 60_000)
    render(
      <UpNextCard
        event={buildEvent({
          title: 'All-hands',
          startAt: future.toISOString(),
          endAt: new Date(future.getTime() + 30 * 60_000).toISOString(),
          meetingLink: 'https://meet.example.com/abc',
        })}
        onJoin={onJoin}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Join meeting/ }))
    expect(onJoin).toHaveBeenCalledOnce()
  })
})

describe('CalendarsList', () => {
  const calendars: CalendarOption[] = [
    { id: 'c1', name: 'Personal', color: '#BFFF00', visible: true },
    { id: 'c2', name: 'Work', color: '#A78BFA', visible: false },
  ]

  it('renders each calendar with its name', () => {
    render(<CalendarsList calendars={calendars} onToggle={() => {}} />)
    expect(screen.getByText('Personal')).toBeInTheDocument()
    expect(screen.getByText('Work')).toBeInTheDocument()
  })

  it('strikes through hidden calendars and fires onToggle', () => {
    const onToggle = vi.fn()
    render(<CalendarsList calendars={calendars} onToggle={onToggle} />)
    const work = screen.getByText('Work')
    expect(work.className).toMatch(/line-through/)
    fireEvent.click(work)
    expect(onToggle).toHaveBeenCalledWith('c2')
  })

  it('shows an empty hint when there are no calendars', () => {
    render(<CalendarsList calendars={[]} onToggle={() => {}} />)
    expect(screen.getByText(/Events will be grouped here/)).toBeInTheDocument()
  })
})

describe('DayGrid', () => {
  it('renders the day header and an event in the column', () => {
    render(
      <DayGrid
        day={new Date('2026-04-23')}
        events={[
          buildEvent({
            title: 'Sprint planning',
            startAt: '2026-04-23T09:00:00',
            endAt: '2026-04-23T10:00:00',
          }),
        ]}
        startHour={8}
        endHour={18}
      />,
    )
    // Day-of-week + day number.
    expect(screen.getByText(/Thursday/)).toBeInTheDocument()
    expect(screen.getByText('23')).toBeInTheDocument()
    expect(screen.getByText('Sprint planning')).toBeInTheDocument()
  })

  it('fires onSlotClick when an empty hour is clicked', () => {
    const onSlot = vi.fn()
    render(
      <DayGrid
        day={new Date('2026-04-23')}
        events={[]}
        startHour={9}
        endHour={11}
        onSlotClick={onSlot}
      />,
    )
    fireEvent.click(screen.getAllByLabelText(/Create event at/)[0])
    expect(onSlot).toHaveBeenCalledOnce()
  })
})
