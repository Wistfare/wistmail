import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { TodayFlowPanel } from './index'

describe('TodayFlowPanel', () => {
  it('renders focus headline + meetings + AI brief', () => {
    render(
      <TodayFlowPanel
        focusLabel="2h 14m focus"
        focusHint="hint"
        meetings={[
          {
            id: 'm1',
            title: 'Design review',
            startsAt: new Date('2026-04-23T10:00:00').toISOString(),
            endsAt: new Date('2026-04-23T11:00:00').toISOString(),
            meetingLink: 'https://meet.example.com/x',
          },
        ]}
        aiBrief={<p>Reply to Sarah next.</p>}
      />,
    )
    expect(screen.getByText('2h 14m focus')).toBeInTheDocument()
    expect(screen.getByText('hint')).toBeInTheDocument()
    expect(screen.getByText('Design review')).toBeInTheDocument()
    expect(screen.getByText(/Reply to Sarah/)).toBeInTheDocument()
  })

  it('shows the empty meetings state', () => {
    render(<TodayFlowPanel meetings={[]} />)
    expect(screen.getByText(/No meetings on the calendar today/)).toBeInTheDocument()
  })

  it('fires onJoinMeeting when the join button is clicked', () => {
    const onJoin = vi.fn()
    render(
      <TodayFlowPanel
        meetings={[
          {
            id: 'm1',
            title: 'Standup',
            startsAt: new Date().toISOString(),
            endsAt: new Date().toISOString(),
            meetingLink: 'https://meet.example.com/y',
          },
        ]}
        onJoinMeeting={onJoin}
      />,
    )
    fireEvent.click(screen.getByLabelText('Join Standup'))
    expect(onJoin).toHaveBeenCalledOnce()
    expect(onJoin.mock.calls[0][0].id).toBe('m1')
  })
})
