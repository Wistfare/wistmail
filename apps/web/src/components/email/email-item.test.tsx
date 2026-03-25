import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { EmailItem } from './email-item'

const baseProps = {
  id: 'eml_1',
  from: 'Alex Johnson',
  subject: 'Q1 Roadmap Review',
  preview: 'Hey team, sharing the updated roadmap...',
  timestamp: '2:34 PM',
  isRead: false,
  isStarred: false,
}

describe('EmailItem', () => {
  it('renders sender, subject, preview, and timestamp', () => {
    render(<EmailItem {...baseProps} />)
    expect(screen.getByText('Alex Johnson')).toBeInTheDocument()
    expect(screen.getByText('Q1 Roadmap Review')).toBeInTheDocument()
    expect(screen.getByText('Hey team, sharing the updated roadmap...')).toBeInTheDocument()
    expect(screen.getByText('2:34 PM')).toBeInTheDocument()
  })

  it('shows unread indicator when not read', () => {
    const { container } = render(<EmailItem {...baseProps} isRead={false} />)
    const dot = container.querySelector('.bg-wm-accent')
    expect(dot).toBeInTheDocument()
  })

  it('hides unread indicator when read', () => {
    const { container } = render(<EmailItem {...baseProps} isRead={true} />)
    const dots = container.querySelectorAll('.bg-wm-accent')
    // No unread dot (there might be other accent elements)
    const unreadDot = container.querySelector('.h-1\\.5.w-1\\.5.rounded-full.bg-wm-accent')
    expect(unreadDot).not.toBeInTheDocument()
  })

  it('applies bold styling for unread emails', () => {
    render(<EmailItem {...baseProps} isRead={false} />)
    expect(screen.getByText('Alex Johnson')).toHaveClass('font-semibold')
  })

  it('applies normal styling for read emails', () => {
    render(<EmailItem {...baseProps} isRead={true} />)
    expect(screen.getByText('Alex Johnson')).toHaveClass('text-wm-text-secondary')
  })

  it('fires onClick when clicked', () => {
    const onClick = vi.fn()
    render(<EmailItem {...baseProps} onClick={onClick} />)
    fireEvent.click(screen.getByText('Alex Johnson'))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('fires onStar when star clicked without triggering onClick', () => {
    const onClick = vi.fn()
    const onStar = vi.fn()
    render(<EmailItem {...baseProps} onClick={onClick} onStar={onStar} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onStar).toHaveBeenCalledOnce()
    expect(onClick).not.toHaveBeenCalled()
  })

  it('renders labels', () => {
    render(
      <EmailItem
        {...baseProps}
        labels={[
          { name: 'Primary', color: '#BFFF00' },
          { name: 'Updates', color: '#3B82F6' },
        ]}
      />,
    )
    expect(screen.getByText('Primary')).toBeInTheDocument()
    expect(screen.getByText('Updates')).toBeInTheDocument()
  })

  it('applies selected styling', () => {
    const { container } = render(<EmailItem {...baseProps} selected={true} />)
    expect(container.firstChild).toHaveClass('border-l-wm-accent')
  })
})
