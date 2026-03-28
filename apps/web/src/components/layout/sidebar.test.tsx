import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Sidebar } from './sidebar'

vi.mock('next/navigation', () => ({
  usePathname: () => '/inbox',
}))

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

const defaultUser = {
  name: 'Alice Smith',
  email: 'alice@example.com',
}

describe('Sidebar', () => {
  it('renders the Wistfare Mail logo link', () => {
    render(<Sidebar user={defaultUser} />)
    expect(screen.getByText('W')).toBeInTheDocument()
  })

  it('renders module icons in the icon rail', () => {
    render(<Sidebar user={defaultUser} />)
    expect(screen.getByTitle('Mail')).toBeInTheDocument()
    expect(screen.getByTitle('Contacts')).toBeInTheDocument()
    expect(screen.getByTitle('Search')).toBeInTheDocument()
    expect(screen.getByTitle('Calendar')).toBeInTheDocument()
    expect(screen.getByTitle('Admin')).toBeInTheDocument()
    expect(screen.getByTitle('Settings')).toBeInTheDocument()
  })

  it('renders mail navigation items by default', () => {
    render(<Sidebar user={defaultUser} />)
    expect(screen.getByText('Inbox')).toBeInTheDocument()
    expect(screen.getByText('Starred')).toBeInTheDocument()
    expect(screen.getByText('Snoozed')).toBeInTheDocument()
    expect(screen.getByText('Sent')).toBeInTheDocument()
    expect(screen.getByText('Drafts')).toBeInTheDocument()
    expect(screen.getByText('Scheduled')).toBeInTheDocument()
    expect(screen.getByText('Spam')).toBeInTheDocument()
    expect(screen.getByText('Trash')).toBeInTheDocument()
  })

  it('renders Compose button in mail module', () => {
    render(<Sidebar user={defaultUser} />)
    expect(screen.getByText('Compose')).toBeInTheDocument()
  })

  it('renders the MAIL section header', () => {
    render(<Sidebar user={defaultUser} />)
    expect(screen.getByText('MAIL')).toBeInTheDocument()
  })

  it('renders unread count badges', () => {
    render(<Sidebar user={defaultUser} unreadCounts={{ inbox: 5, drafts: 2 }} />)
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('does not render badge for zero count', () => {
    render(<Sidebar user={defaultUser} unreadCounts={{ inbox: 0 }} />)
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })

  it('renders labels when provided', () => {
    const labels = [
      { name: 'Work', color: '#3B82F6' },
      { name: 'Personal', color: '#10B981' },
    ]
    render(<Sidebar user={defaultUser} labels={labels} />)
    expect(screen.getByText('LABELS')).toBeInTheDocument()
    expect(screen.getByText('Work')).toBeInTheDocument()
    expect(screen.getByText('Personal')).toBeInTheDocument()
  })

  it('does not render labels section when no labels provided', () => {
    render(<Sidebar user={defaultUser} labels={[]} />)
    expect(screen.queryByText('LABELS')).not.toBeInTheDocument()
  })

  it('switches to admin module when Admin icon is clicked', () => {
    render(<Sidebar user={defaultUser} />)
    fireEvent.click(screen.getByTitle('Admin'))
    expect(screen.getByText('ADMIN')).toBeInTheDocument()
    expect(screen.getByText('Users')).toBeInTheDocument()
    expect(screen.getByText('Roles')).toBeInTheDocument()
    expect(screen.getByText('Organization')).toBeInTheDocument()
    expect(screen.getByText('Audit Log')).toBeInTheDocument()
    expect(screen.getByText('Invite User')).toBeInTheDocument()
  })

  it('switches to settings module when Settings icon is clicked', () => {
    render(<Sidebar user={defaultUser} />)
    fireEvent.click(screen.getByTitle('Settings'))
    expect(screen.getByText('SETTINGS')).toBeInTheDocument()
    expect(screen.getByText('Account')).toBeInTheDocument()
    expect(screen.getByText('Domains')).toBeInTheDocument()
    expect(screen.getByText('API Keys')).toBeInTheDocument()
    expect(screen.getByText('Webhooks')).toBeInTheDocument()
    expect(screen.getByText('Signatures')).toBeInTheDocument()
    expect(screen.getByText('Filters')).toBeInTheDocument()
    expect(screen.getByText('AI')).toBeInTheDocument()
    expect(screen.getByText('Security')).toBeInTheDocument()
  })

  it('shows settings admin section with Users & Mailbox, Sending Logs, Sending', () => {
    render(<Sidebar user={defaultUser} />)
    fireEvent.click(screen.getByTitle('Settings'))
    expect(screen.getByText('Users & Mailbox')).toBeInTheDocument()
    expect(screen.getByText('Sending Logs')).toBeInTheDocument()
    expect(screen.getByText('Sending')).toBeInTheDocument()
  })

  it('shows "Coming soon" for contacts module', () => {
    render(<Sidebar user={defaultUser} />)
    fireEvent.click(screen.getByTitle('Contacts'))
    expect(screen.getByText('Coming soon')).toBeInTheDocument()
  })

  it('shows "Coming soon" for calendar module', () => {
    render(<Sidebar user={defaultUser} />)
    fireEvent.click(screen.getByTitle('Calendar'))
    expect(screen.getByText('Coming soon')).toBeInTheDocument()
  })

  it('shows "Coming soon" for search module', () => {
    render(<Sidebar user={defaultUser} />)
    fireEvent.click(screen.getByTitle('Search'))
    expect(screen.getByText('Coming soon')).toBeInTheDocument()
  })

  it('applies custom className', () => {
    const { container } = render(<Sidebar user={defaultUser} className="custom-sidebar" />)
    expect(container.querySelector('.custom-sidebar')).toBeInTheDocument()
  })
})
