'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import {
  Calendar as CalendarIcon,
  FolderKanban,
  Inbox as InboxIcon,
} from 'lucide-react'
import { IconRail, type IconRailItem } from './icon-rail'
import { MailSidebar } from './mail-sidebar'
import { ChatSidebar } from './chat-sidebar'
import { CalendarSidebar } from './calendar-sidebar'
import { WorkSidebar } from './work-sidebar'
import { DocsSidebar } from './docs-sidebar'
import { MeetingsSidebar } from './meetings-sidebar'
import { SettingsSidebar } from './settings-sidebar'
import { AdminSidebar } from './admin-sidebar'
import { UserMenuPanel } from './user-menu'
import { CommandPalette } from './command-palette'
import { useCompose } from '@/components/email/compose-provider'

/**
 * AppShell — the V3 authenticated layout.
 *
 * - Renders the IconRail (modules) on the far left
 * - Renders the contextual module sidebar (Mail / Chat / Calendar / Work
 *   / Docs / Meetings / Settings / Admin) based on the current pathname
 * - Wraps page children in a scrolling main column
 * - Hosts the user menu floating panel and the global Cmd+K palette
 *
 * Pencil references: `Component/SidebarV2` (`PobTe`),
 * `Screen/CommandPalette` (`aAA4e`).
 */

export interface AppShellProps {
  user: { id: string; name: string; email: string; avatarUrl?: string | null; role?: string }
  children: React.ReactNode
}

type Module = 'mail' | 'chat' | 'calendar' | 'work' | 'docs' | 'meetings' | 'settings' | 'admin'

function moduleFor(pathname: string): Module {
  if (pathname.startsWith('/chat')) return 'chat'
  if (pathname.startsWith('/calendar')) return 'calendar'
  if (pathname.startsWith('/work')) return 'work'
  if (pathname.startsWith('/docs')) return 'docs'
  if (pathname.startsWith('/meetings')) return 'meetings'
  if (pathname.startsWith('/admin')) return 'admin'
  if (pathname.startsWith('/settings')) return 'settings'
  return 'mail'
}

export function AppShell({ user, children }: AppShellProps) {
  const pathname = usePathname()
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const isAdmin = user.role === 'owner' || user.role === 'admin'
  const { openCompose } = useCompose()
  const mod = moduleFor(pathname)

  // Cmd/Ctrl+K to open palette globally.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isK = e.key === 'k' || e.key === 'K'
      if (isK && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setPaletteOpen(true)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  // Pencil InboxV3 iconRail (`heGq7`) shows exactly three nav tiles:
  // Inbox / Calendar / Work. Chat is folded into Inbox via the
  // segmented control (ALL · MAIL · CHATS), so it does not get its
  // own rail entry. Settings + Admin stay reachable from the user
  // menu and from direct routes (/settings, /admin) — Pencil simply
  // doesn't surface them on the rail. We honour that 1:1.
  const topItems: IconRailItem[] = [
    {
      href: '/inbox',
      icon: <InboxIcon style={{ width: 20, height: 20 }} />,
      label: 'Inbox',
      match: (p) =>
        p === '/' ||
        p.startsWith('/inbox') ||
        p.startsWith('/chat') ||
        p.startsWith('/compose') ||
        p.startsWith('/search') ||
        p.startsWith('/sent') ||
        p.startsWith('/drafts') ||
        p.startsWith('/scheduled') ||
        p.startsWith('/snoozed') ||
        p.startsWith('/starred') ||
        p.startsWith('/spam') ||
        p.startsWith('/trash'),
    },
    {
      href: '/calendar',
      icon: <CalendarIcon style={{ width: 20, height: 20 }} />,
      label: 'Calendar',
    },
    {
      href: '/work',
      icon: <FolderKanban style={{ width: 20, height: 20 }} />,
      label: 'Work',
    },
  ]
  // Pencil's rail has no bottom-area items beyond the avatar — keep
  // bottomItems empty so the only thing under the spacer is the
  // avatar / user-menu trigger.
  const bottomItems: IconRailItem[] = []

  return (
    <div className="flex h-screen overflow-hidden bg-wm-bg text-wm-text-primary">
      <IconRail
        topItems={topItems}
        bottomItems={bottomItems}
        pathname={pathname}
        user={{ name: user.name, avatarUrl: user.avatarUrl }}
        onAvatarClick={() => setUserMenuOpen((v) => !v)}
      />

      {/* Floating user menu anchored next to the rail. The rail is
          72-px wide (Pencil iconRail), so the panel sits at left:80
          (72 + 8-px gutter). */}
      {userMenuOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setUserMenuOpen(false)}
            aria-hidden
          />
          <div className="fixed bottom-3 z-50 w-64" style={{ left: 80 }}>
            <UserMenuPanel user={user} onClose={() => setUserMenuOpen(false)} />
          </div>
        </>
      )}

      {/* Pencil InboxV3 (`TB36x`) and ChatViewV3 (`X1Safv`) are
          self-contained 3- to 4-column layouts that own their own
          left-side list, so the global module sidebar is suppressed
          on those routes. Other Mail/Chat sub-routes (sent, drafts,
          /chat/new, etc.) keep the sidebar for now. */}
      {pathname !== '/inbox' &&
        !pathname.startsWith('/chat') &&
        renderModuleSidebar(mod, user, () => setUserMenuOpen((v) => !v))}

      <main className="flex-1 overflow-y-auto">{children}</main>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        isAdmin={isAdmin}
        onCompose={() => openCompose()}
      />
    </div>
  )
}

function renderModuleSidebar(
  mod: Module,
  user: AppShellProps['user'],
  onUserMenu: () => void,
) {
  switch (mod) {
    case 'chat':
      return <ChatSidebar user={user} onUserMenu={onUserMenu} />
    case 'calendar':
      return <CalendarSidebar user={user} onUserMenu={onUserMenu} />
    case 'work':
      return <WorkSidebar user={user} onUserMenu={onUserMenu} />
    case 'docs':
      return <DocsSidebar user={user} onUserMenu={onUserMenu} />
    case 'meetings':
      return <MeetingsSidebar user={user} onUserMenu={onUserMenu} />
    case 'settings':
      return <SettingsSidebar user={user} onUserMenu={onUserMenu} />
    case 'admin':
      return <AdminSidebar user={user} onUserMenu={onUserMenu} />
    case 'mail':
    default:
      return <MailSidebar user={user} onUserMenu={onUserMenu} />
  }
}
