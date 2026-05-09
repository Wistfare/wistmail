import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import {
  AIBrief,
  EmailRowV3,
  FilterPills,
  ICSCard,
  InboxSectionHeader,
  TodayPanel,
} from './index'

const sample = {
  id: 'em_1',
  fromAddress: 'Sarah Kim <sarah@wm.com>',
  displayName: 'Sarah Kim',
  subject: 'Q1 Product Roadmap Review',
  snippet: 'Heads up — we should sync on the API surface before review.',
  createdAt: new Date(Date.now() - 60_000).toISOString(),
  isRead: false,
  isStarred: false,
}

describe('EmailRowV3', () => {
  it('renders sender, subject, and snippet', () => {
    render(<EmailRowV3 email={sample} />)
    expect(screen.getByText('Sarah Kim')).toBeInTheDocument()
    expect(screen.getByText('Q1 Product Roadmap Review')).toBeInTheDocument()
    expect(screen.getByText(/Heads up/)).toBeInTheDocument()
  })

  it('marks active row with aria-selected styling', () => {
    const { container } = render(<EmailRowV3 email={sample} selected />)
    expect(container.querySelector('[data-active="true"]')).not.toBeNull()
  })

  it('toggles star on star click', () => {
    const onToggleStar = vi.fn()
    render(<EmailRowV3 email={sample} onToggleStar={onToggleStar} />)
    fireEvent.click(screen.getByLabelText('Star'))
    expect(onToggleStar).toHaveBeenCalledOnce()
  })

  it('falls back to "(no subject)"', () => {
    render(<EmailRowV3 email={{ ...sample, subject: '' }} />)
    expect(screen.getByText('(no subject)')).toBeInTheDocument()
  })

  it('renders trailing slot content', () => {
    render(
      <EmailRowV3
        email={sample}
        trailing={<span data-testid="pill">!</span>}
      />,
    )
    expect(screen.getByTestId('pill')).toBeInTheDocument()
  })
})

describe('FilterPills', () => {
  it('renders options and fires onChange', () => {
    const onChange = vi.fn()
    render(
      <FilterPills
        value="all"
        options={[
          { id: 'all', label: 'All' },
          { id: 'mail', label: 'Mail', count: 12 },
        ]}
        onChange={onChange}
      />,
    )
    const all = screen.getByRole('button', { name: /All/ })
    expect(all).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: /Mail/ }))
    expect(onChange).toHaveBeenCalledWith('mail')
  })
})

describe('InboxSectionHeader', () => {
  it('renders label + count', () => {
    render(<InboxSectionHeader label="Today" count={4} />)
    expect(screen.getByText(/Today/)).toBeInTheDocument()
    expect(screen.getByText(/4/)).toBeInTheDocument()
  })
})

describe('AIBrief', () => {
  it('renders bullets and actions', () => {
    const onClick = vi.fn()
    render(
      <AIBrief
        points={['Cloudflare → DNS in minutes', 'Open source · self-hosted']}
        actions={[{ id: 'tasks', label: 'Extract tasks', onClick }]}
      />,
    )
    expect(screen.getByText(/Cloudflare/)).toBeInTheDocument()
    expect(screen.getByText(/Open source/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Extract tasks/ }))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('shows loading skeleton when loading', () => {
    const { container } = render(<AIBrief points={[]} loading />)
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
  })
})

describe('TodayPanel', () => {
  it('renders next-up event with join button', () => {
    const onJoin = vi.fn()
    const now = new Date('2026-04-23T14:00:00Z')
    const events = [
      {
        id: 'ev1',
        title: 'Design review with Sarah',
        startsAt: '2026-04-23T14:30:00Z',
        endsAt: '2026-04-23T15:00:00Z',
        isNext: true,
      },
    ]
    render(<TodayPanel now={now} events={events} onJoinMeeting={onJoin} />)
    expect(screen.getByText('Design review with Sarah')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Join meeting/ }))
    expect(onJoin).toHaveBeenCalledOnce()
  })

  it('toggles action items', () => {
    const toggle = vi.fn()
    render(
      <TodayPanel
        events={[]}
        actions={[
          { id: 'a1', title: 'Reply to Alex', onToggle: toggle },
        ]}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Reply to Alex/ }))
    expect(toggle).toHaveBeenCalledOnce()
  })
})

describe('ICSCard', () => {
  it('renders RSVP buttons and fires accept', () => {
    const onAccept = vi.fn()
    render(
      <ICSCard
        title="All-hands"
        when="Wed Apr 23 · 14:00"
        onAccept={onAccept}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Accept/ }))
    expect(onAccept).toHaveBeenCalledOnce()
  })
})
