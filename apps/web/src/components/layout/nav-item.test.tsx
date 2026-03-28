import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NavItem } from './nav-item'

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

describe('NavItem', () => {
  it('renders label and icon', () => {
    render(<NavItem icon={<span data-testid="icon">I</span>} label="Inbox" href="/inbox" />)
    expect(screen.getByText('Inbox')).toBeInTheDocument()
    expect(screen.getByTestId('icon')).toBeInTheDocument()
  })

  it('links to the correct href', () => {
    render(<NavItem icon={<span>I</span>} label="Inbox" href="/inbox" />)
    expect(screen.getByRole('link')).toHaveAttribute('href', '/inbox')
  })

  it('shows badge when count is greater than zero', () => {
    render(<NavItem icon={<span>I</span>} label="Inbox" href="/inbox" badge={12} />)
    expect(screen.getByText('12')).toBeInTheDocument()
  })

  it('does not show badge when count is zero', () => {
    render(<NavItem icon={<span>I</span>} label="Inbox" href="/inbox" badge={0} />)
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })

  it('does not show badge when badge is undefined', () => {
    const { container } = render(<NavItem icon={<span>I</span>} label="Inbox" href="/inbox" />)
    // No badge span with accent background
    const badgeSpans = container.querySelectorAll('.bg-wm-accent')
    expect(badgeSpans.length).toBe(0)
  })

  it('applies active styling when active', () => {
    const { container } = render(<NavItem icon={<span>I</span>} label="Inbox" href="/inbox" active={true} />)
    const link = container.querySelector('a')
    expect(link?.className).toContain('border-wm-accent')
    expect(link?.className).toContain('text-wm-accent')
  })

  it('applies inactive styling when not active', () => {
    const { container } = render(<NavItem icon={<span>I</span>} label="Inbox" href="/inbox" active={false} />)
    const link = container.querySelector('a')
    expect(link?.className).toContain('text-wm-text-tertiary')
  })

  it('merges custom className', () => {
    const { container } = render(
      <NavItem icon={<span>I</span>} label="Inbox" href="/inbox" className="custom-nav" />,
    )
    const link = container.querySelector('a')
    expect(link?.className).toContain('custom-nav')
  })
})
