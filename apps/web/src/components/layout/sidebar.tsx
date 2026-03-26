'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import {
  Inbox, Star, Clock, Send, FileText, CalendarClock, ShieldAlert, Trash2,
  Plus, Users, Settings, Mail, Shield,
  User, Globe, Key, PenLine, Sparkles, Building2, ScrollText, UserPlus,
  Search, Calendar,
} from 'lucide-react'
import { NavItem } from './nav-item'
import { Avatar } from '@/components/ui/avatar'
import { LabelDot } from '@/components/ui/label-dot'
import { ROUTES } from '@/lib/constants'
import { cn } from '@/lib/utils'

export interface SidebarProps {
  user: { name: string; email: string; avatarUrl?: string }
  activeRoute?: string
  unreadCounts?: Record<string, number>
  labels?: Array<{ name: string; color: string }>
  className?: string
}

type Module = 'mail' | 'contacts' | 'search' | 'calendar' | 'settings' | 'admin'

const MODULE_ICONS: Array<{ id: Module; icon: typeof Mail; label: string; href: string }> = [
  { id: 'mail', icon: Mail, label: 'Mail', href: ROUTES.INBOX },
  { id: 'contacts', icon: Users, label: 'Contacts', href: ROUTES.CONTACTS },
  { id: 'search', icon: Search, label: 'Search', href: ROUTES.SEARCH },
  { id: 'calendar', icon: Calendar, label: 'Calendar', href: '/calendar' },
  { id: 'admin', icon: Shield, label: 'Admin', href: '/admin/users' },
  { id: 'settings', icon: Settings, label: 'Settings', href: ROUTES.SETTINGS },
]

// ── Panel 2 nav configs per module ──────────────────────────────────────────

const MAIL_NAV = [
  { icon: <Inbox className="h-4 w-4" />, label: 'Inbox', href: ROUTES.INBOX, countKey: 'inbox' },
  { icon: <Star className="h-4 w-4" />, label: 'Starred', href: ROUTES.STARRED },
  { icon: <Clock className="h-4 w-4" />, label: 'Snoozed', href: ROUTES.SNOOZED },
  { icon: <Send className="h-4 w-4" />, label: 'Sent', href: ROUTES.SENT },
  { icon: <FileText className="h-4 w-4" />, label: 'Drafts', href: ROUTES.DRAFTS, countKey: 'drafts' },
  { icon: <CalendarClock className="h-4 w-4" />, label: 'Scheduled', href: ROUTES.SCHEDULED, countKey: 'scheduled' },
  { icon: <ShieldAlert className="h-4 w-4" />, label: 'Spam', href: ROUTES.SPAM },
  { icon: <Trash2 className="h-4 w-4" />, label: 'Trash', href: ROUTES.TRASH },
]

const SETTINGS_NAV = [
  { icon: <User className="h-4 w-4" />, label: 'Account', href: '/settings/account' },
  { icon: <Globe className="h-4 w-4" />, label: 'Domains', href: '/settings/domains' },
  { icon: <Key className="h-4 w-4" />, label: 'API Keys', href: '/settings/api-keys' },
  { icon: <PenLine className="h-4 w-4" />, label: 'Signatures', href: '/settings/signatures' },
  { icon: <Sparkles className="h-4 w-4" />, label: 'AI', href: '/settings/ai' },
]

const ADMIN_NAV = [
  { icon: <Users className="h-4 w-4" />, label: 'Users', href: '/admin/users' },
  { icon: <Shield className="h-4 w-4" />, label: 'Roles', href: '/admin/roles' },
  { icon: <Building2 className="h-4 w-4" />, label: 'Organization', href: '/admin/organization' },
  { icon: <Settings className="h-4 w-4" />, label: 'Settings', href: '/admin/settings' },
  { icon: <ScrollText className="h-4 w-4" />, label: 'Audit Log', href: '/admin/audit-logs' },
]

function detectModule(pathname: string): Module {
  if (pathname.startsWith('/admin')) return 'admin'
  if (pathname.startsWith('/settings')) return 'settings'
  if (pathname.startsWith('/contacts')) return 'contacts'
  if (pathname.startsWith('/search')) return 'search'
  if (pathname.startsWith('/calendar')) return 'calendar'
  return 'mail'
}

export function Sidebar({ user, unreadCounts = {}, labels = [], className }: SidebarProps) {
  const pathname = usePathname()
  const [activeModule, setActiveModule] = useState<Module>(detectModule(pathname))

  useEffect(() => {
    setActiveModule(detectModule(pathname))
  }, [pathname])

  return (
    <aside className={cn('flex h-full shrink-0', className)}>
      {/* ── Panel 1: Icon rail (48px) ── */}
      <div className="flex w-12 flex-col items-center border-r border-wm-border bg-wm-bg py-3 gap-1">
        {/* Logo */}
        <Link href="/" className="mb-3 flex h-7 w-7 items-center justify-center bg-wm-accent">
          <span className="text-xs font-bold text-wm-text-on-accent">W</span>
        </Link>

        {/* Module icons */}
        {MODULE_ICONS.map((mod) => {
          const Icon = mod.icon
          const isActive = activeModule === mod.id
          return (
            <Link
              key={mod.id}
              href={mod.href}
              onClick={() => setActiveModule(mod.id)}
              className={cn(
                'flex h-9 w-9 items-center justify-center transition-colors',
                isActive
                  ? 'bg-wm-accent/15 text-wm-accent'
                  : 'text-wm-text-muted hover:bg-wm-surface-hover hover:text-wm-text-secondary',
              )}
              title={mod.label}
            >
              <Icon className="h-[18px] w-[18px]" />
            </Link>
          )
        })}

        <div className="flex-1" />

        {/* User avatar */}
        <Avatar name={user.name} src={user.avatarUrl} size="sm" />
      </div>

      {/* ── Panel 2: Contextual navigation ── */}
      <div className="flex w-[180px] flex-col border-r border-wm-border bg-wm-surface">
        {/* ── MAIL module ── */}
        {activeModule === 'mail' && (
          <>
            {/* Compose button */}
            <div className="px-3 pt-3 pb-2">
              <Link
                href="/compose"
                className="flex w-full items-center justify-center gap-2 bg-wm-accent px-4 py-2.5 font-mono text-xs font-semibold text-wm-text-on-accent transition-colors hover:bg-wm-accent-hover"
              >
                <Plus className="h-4 w-4" />
                Compose
              </Link>
            </div>

            <nav className="flex flex-col">
              {MAIL_NAV.map((item) => (
                <NavItem
                  key={item.href}
                  icon={item.icon}
                  label={item.label}
                  href={item.href}
                  active={pathname === item.href}
                  badge={item.countKey ? unreadCounts[item.countKey] : undefined}
                />
              ))}
            </nav>

            {/* Labels */}
            {labels.length > 0 && (
              <>
                <div className="flex items-center justify-between px-4 pb-1 pt-4">
                  <span className="font-mono text-[10px] font-semibold tracking-[1px] text-wm-text-muted">
                    LABELS
                  </span>
                  <Plus className="h-3 w-3 cursor-pointer text-wm-text-muted hover:text-wm-text-secondary" />
                </div>
                <div className="flex flex-col">
                  {labels.map((label) => (
                    <button
                      key={label.name}
                      className="flex items-center gap-2 px-5 py-1.5 text-left hover:bg-wm-surface-hover"
                    >
                      <LabelDot color={label.color} label={label.name} />
                    </button>
                  ))}
                </div>
              </>
            )}

            <div className="flex-1" />

            {/* User info */}
            <div className="flex items-center gap-2 border-t border-wm-border px-3 py-3">
              <Avatar name={user.name} src={user.avatarUrl} size="sm" />
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-xs font-semibold text-wm-text-primary">{user.name}</span>
                <span className="truncate font-mono text-[10px] text-wm-text-tertiary">{user.email}</span>
              </div>
            </div>
          </>
        )}

        {/* ── ADMIN module ── */}
        {activeModule === 'admin' && (
          <>
            {/* Invite User button */}
            <div className="px-3 pt-3 pb-2">
              <button className="flex w-full cursor-pointer items-center justify-center gap-2 bg-wm-accent px-4 py-2.5 font-mono text-xs font-semibold text-wm-text-on-accent transition-colors hover:bg-wm-accent-hover">
                <UserPlus className="h-4 w-4" />
                Invite User
              </button>
            </div>

            <div className="px-4 pb-1 pt-2">
              <span className="font-mono text-[10px] font-semibold tracking-[1px] text-wm-text-muted">
                ADMIN
              </span>
            </div>

            <nav className="flex flex-col">
              {ADMIN_NAV.map((item) => (
                <NavItem
                  key={item.href}
                  icon={item.icon}
                  label={item.label}
                  href={item.href}
                  active={pathname === item.href}
                />
              ))}
            </nav>

            <div className="flex-1" />

            <div className="flex items-center gap-2 border-t border-wm-border px-3 py-3">
              <Avatar name={user.name} src={user.avatarUrl} size="sm" />
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-xs font-semibold text-wm-text-primary">{user.name}</span>
                <span className="truncate font-mono text-[10px] text-wm-text-tertiary">{user.email}</span>
              </div>
            </div>
          </>
        )}

        {/* ── SETTINGS module ── */}
        {activeModule === 'settings' && (
          <>
            <div className="px-4 pt-4 pb-2">
              <span className="font-mono text-[10px] font-semibold tracking-[1px] text-wm-text-muted">
                SETTINGS
              </span>
            </div>

            <nav className="flex flex-col">
              {SETTINGS_NAV.map((item) => (
                <NavItem
                  key={item.href}
                  icon={item.icon}
                  label={item.label}
                  href={item.href}
                  active={pathname === item.href}
                />
              ))}
            </nav>

            <div className="flex-1" />

            <div className="flex items-center gap-2 border-t border-wm-border px-3 py-3">
              <Avatar name={user.name} src={user.avatarUrl} size="sm" />
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-xs font-semibold text-wm-text-primary">{user.name}</span>
                <span className="truncate font-mono text-[10px] text-wm-text-tertiary">{user.email}</span>
              </div>
            </div>
          </>
        )}

        {/* ── Placeholder modules ── */}
        {(activeModule === 'contacts' || activeModule === 'search' || activeModule === 'calendar') && (
          <>
            <div className="px-4 pt-4 pb-2">
              <span className="font-mono text-[10px] font-semibold tracking-[1px] text-wm-text-muted">
                {activeModule.toUpperCase()}
              </span>
            </div>
            <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4">
              <p className="text-center font-mono text-[11px] text-wm-text-muted">Coming soon</p>
            </div>
            <div className="flex items-center gap-2 border-t border-wm-border px-3 py-3">
              <Avatar name={user.name} src={user.avatarUrl} size="sm" />
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-xs font-semibold text-wm-text-primary">{user.name}</span>
                <span className="truncate font-mono text-[10px] text-wm-text-tertiary">{user.email}</span>
              </div>
            </div>
          </>
        )}
      </div>
    </aside>
  )
}
