import { useState } from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import {
  IconRail,
  PageHeader,
  SidebarComposeButton,
  SidebarLabelItem,
  SidebarNavItem,
  SidebarSection,
  SidebarShell,
  SidebarUser,
  CommandPalette,
} from './index'
import { Inbox, Mail, MessageSquare } from 'lucide-react'

// next/navigation isn't auto-mocked. Stub the hooks our shell touches
// (usePathname / useSearchParams / useRouter) globally for these tests.
const pushMock = vi.fn()
vi.mock('next/navigation', () => ({
  usePathname: () => '/inbox',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: pushMock, replace: pushMock, refresh: vi.fn(), back: vi.fn(), forward: vi.fn() }),
}))

beforeEach(() => {
  pushMock.mockReset()
})

describe('IconRail', () => {
  it('renders top + bottom items and marks active by pathname', () => {
    render(
      <IconRail
        topItems={[
          { href: '/inbox', icon: <Mail data-testid="mail" className="h-5 w-5" />, label: 'Mail' },
          { href: '/chat', icon: <MessageSquare data-testid="chat" className="h-5 w-5" />, label: 'Chat' },
        ]}
        bottomItems={[]}
        pathname="/inbox/123"
        user={{ name: 'Veda Buengimana' }}
      />,
    )
    expect(screen.getByTestId('mail')).toBeInTheDocument()
    expect(screen.getByTestId('chat')).toBeInTheDocument()

    const mailLink = screen.getByRole('link', { name: 'Mail' })
    expect(mailLink).toHaveAttribute('aria-current', 'page')
  })

  it('renders avatar with initials and fires onAvatarClick', () => {
    const onAvatarClick = vi.fn()
    render(
      <IconRail
        topItems={[]}
        pathname="/"
        user={{ name: 'Alex Johnson' }}
        onAvatarClick={onAvatarClick}
      />,
    )
    const btn = screen.getByRole('button', { name: /Account: Alex Johnson/ })
    expect(btn).toHaveTextContent('AJ')
    fireEvent.click(btn)
    expect(onAvatarClick).toHaveBeenCalledOnce()
  })

  it('falls back to "U" when name is empty', () => {
    render(
      <IconRail
        topItems={[]}
        pathname="/"
        user={{ name: '' }}
      />,
    )
    expect(screen.getByRole('button', { name: /Account/ })).toHaveTextContent('U')
  })
})

describe('SidebarShell + primitives', () => {
  it('renders cta, sections, nav items, and footer', () => {
    render(
      <SidebarShell
        cta={<SidebarComposeButton onClick={() => {}}>Compose</SidebarComposeButton>}
        footer={<SidebarUser name="Veda" email="v@wm.com" />}
      >
        <SidebarSection label="Mail">
          <SidebarNavItem
            href="/inbox"
            icon={<Inbox data-testid="ic" className="h-[18px] w-[18px]" />}
            label="Inbox"
            count={12}
            active
          />
          <SidebarNavItem href="/inbox?folder=sent" label="Sent" />
        </SidebarSection>
        <SidebarSection label="Labels">
          <SidebarLabelItem href="/inbox?label=Primary" name="Primary" color="#BFFF00" />
        </SidebarSection>
      </SidebarShell>,
    )
    expect(screen.getByText('Compose')).toBeInTheDocument()
    expect(screen.getByText('Mail')).toBeInTheDocument()
    expect(screen.getByText('Inbox')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText('Primary')).toBeInTheDocument()
    expect(screen.getByText('v@wm.com')).toBeInTheDocument()

    const inbox = screen.getByRole('link', { name: /Inbox/ })
    expect(inbox).toHaveAttribute('aria-current', 'page')
  })

  it('SidebarComposeButton renders as link when href provided', () => {
    render(<SidebarComposeButton href="/chat/new">New chat</SidebarComposeButton>)
    expect(screen.getByRole('link', { name: /New chat/ })).toHaveAttribute('href', '/chat/new')
  })
})

describe('PageHeader', () => {
  it('renders eyebrow / title / subtitle / actions / toolbar', () => {
    render(
      <PageHeader
        eyebrow="INBOX"
        title="All mail"
        subtitle="42 conversations"
        actions={<button>Action</button>}
        toolbar={<div>tools</div>}
      />,
    )
    expect(screen.getByText('INBOX')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'All mail' })).toBeInTheDocument()
    expect(screen.getByText('42 conversations')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Action' })).toBeInTheDocument()
    expect(screen.getByText('tools')).toBeInTheDocument()
  })
})

describe('CommandPalette', () => {
  function Harness({ initialOpen = false, isAdmin = false }: { initialOpen?: boolean; isAdmin?: boolean }) {
    const [open, setOpen] = useState(initialOpen)
    return (
      <>
        <button onClick={() => setOpen(true)}>open</button>
        <CommandPalette open={open} onClose={() => setOpen(false)} isAdmin={isAdmin} />
      </>
    )
  }

  it('does not render when closed', () => {
    render(<Harness />)
    expect(screen.queryByRole('dialog', { name: /Command palette/ })).toBeNull()
  })

  it('opens, filters, and runs href command on Enter', () => {
    render(<Harness initialOpen />)
    expect(screen.getByRole('dialog', { name: /Command palette/ })).toBeInTheDocument()

    const input = screen.getByPlaceholderText('Search commands…')
    fireEvent.change(input, { target: { value: 'inbox' } })

    // first match should be "Go to Inbox"
    expect(screen.getByText('Go to Inbox')).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Enter' })
    expect(pushMock).toHaveBeenCalledWith('/inbox')
  })

  it('shows Admin commands only when isAdmin=true', () => {
    const { rerender } = render(<Harness initialOpen isAdmin={false} />)
    expect(screen.queryByText('Manage users')).toBeNull()
    rerender(<Harness initialOpen isAdmin={true} />)
    expect(screen.getByText('Manage users')).toBeInTheDocument()
  })

  it('Esc closes the palette', () => {
    render(<Harness initialOpen />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: /Command palette/ })).toBeNull()
  })
})
