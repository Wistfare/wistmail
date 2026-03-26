'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import {
  Inbox, Star, Clock, Send, FileText, CalendarClock, ShieldAlert, Trash2,
  Plus, Users, BarChart2, LayoutTemplate, Settings, Mail,
  User, Globe, Key, PenLine, Sparkles, Building2, ScrollText, Users as UsersIcon,
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

type Module = 'mail' | 'contacts' | 'analytics' | 'templates' | 'settings'

const MODULE_ICONS: Array<{ id: Module; icon: typeof Mail; label: string; href: string }> = [
  { id: 'mail', icon: Mail, label: 'Mail', href: ROUTES.INBOX },
  { id: 'contacts', icon: Users, label: 'Contacts', href: ROUTES.CONTACTS },
  { id: 'analytics', icon: BarChart2, label: 'Analytics', href: ROUTES.ANALYTICS },
  { id: 'templates', icon: LayoutTemplate, label: 'Templates', href: ROUTES.TEMPLATES },
  { id: 'settings', icon: Settings, label: 'Settings', href: ROUTES.SETTINGS },
]

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
  { icon: <Building2 className="h-4 w-4" />, label: 'Organization', href: '/admin/organization' },
  { icon: <UsersIcon className="h-4 w-4" />, label: 'Members', href: '/admin/members' },
  { icon: <ScrollText className="h-4 w-4" />, label: 'Audit Logs', href: '/admin/audit-logs' },
]

function detectModule(pathname: string): Module {
  if (pathname.startsWith('/settings') || pathname.startsWith('/admin')) return 'settings'
  if (pathname.startsWith('/contacts')) return 'contacts'
  if (pathname.startsWith('/analytics')) return 'analytics'
  if (pathname.startsWith('/templates')) return 'templates'
  return 'mail'
}

export function Sidebar({ user, unreadCounts = {}, labels = [], className }: SidebarProps) {
  const pathname = usePathname()
  const [activeModule, setActiveModule] = useState<Module>(detectModule(pathname))

  return (
    <aside className={cn('flex h-full', className)}>
      {/* ── Panel 1: Module icon rail ── */}
      <div className="flex w-14 shrink-0 flex-col items-center border-r border-wm-border bg-wm-bg py-4">
        {/* Logo */}
        <div className="mb-4 flex h-8 w-8 items-center justify-center bg-wm-accent">
          <span className="text-sm font-bold text-wm-text-on-accent">W</span>
        </div>

        {/* Module icons */}
        <div className="flex flex-col gap-1">
          {MODULE_ICONS.map((mod) => {
            const Icon = mod.icon
            const isActive = activeModule === mod.id
            return (
              <Link
                key={mod.id}
                href={mod.href}
                onClick={() => setActiveModule(mod.id)}
                className={cn(
                  'flex h-10 w-10 items-center justify-center transition-colors',
                  isActive
                    ? 'bg-wm-accent/15 text-wm-accent'
                    : 'text-wm-text-muted hover:bg-wm-surface-hover hover:text-wm-text-secondary',
                )}
                title={mod.label}
              >
                <Icon className="h-5 w-5" />
              </Link>
            )
          })}
        </div>

        <div className="flex-1" />

        {/* User avatar at bottom */}
        <Avatar name={user.name} src={user.avatarUrl} size="sm" />
      </div>

      {/* ── Panel 2: Contextual navigation ── */}
      <div className="flex w-52 shrink-0 flex-col border-r border-wm-border bg-wm-surface">
        {/* Module title + compose */}
        <div className="px-4 pt-5 pb-3">
          <span className="font-mono text-xs font-semibold tracking-[2px] text-wm-text-muted">
            {activeModule === 'mail' ? 'MAIL' : activeModule.toUpperCase()}
          </span>
        </div>

        {activeModule === 'mail' && (
          <>
            {/* Compose button */}
            <div className="px-3 pb-3">
              <button className="flex w-full cursor-pointer items-center justify-center gap-2 bg-wm-accent px-4 py-2.5 font-mono text-xs font-semibold text-wm-text-on-accent transition-colors hover:bg-wm-accent-hover">
                <Plus className="h-4 w-4" />
                Compose
              </button>
            </div>

            {/* Mail nav items */}
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
                <div className="flex items-center justify-between px-4 pb-1 pt-5">
                  <span className="font-mono text-[10px] font-semibold tracking-[2px] text-wm-text-muted">
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

            {/* Chat section */}
            <div className="flex items-center justify-between px-4 pb-1">
              <span className="font-mono text-[10px] font-semibold tracking-[2px] text-wm-text-muted">
                CHAT
              </span>
              <Plus className="h-3 w-3 cursor-pointer text-wm-text-muted hover:text-wm-text-secondary" />
            </div>
            <div className="flex flex-col gap-0.5 px-3 pb-3">
              <div className="flex items-center gap-2 px-2 py-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-wm-accent" />
                <span className="font-mono text-[11px] text-wm-text-secondary">Alex Johnson</span>
                <span className="flex-1" />
                <span className="font-mono text-[9px] text-wm-accent">Online</span>
              </div>
              <div className="flex items-center gap-2 px-2 py-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-wm-warning" />
                <span className="font-mono text-[11px] text-wm-text-secondary">Sarah Chen</span>
                <span className="flex-1" />
                <span className="font-mono text-[9px] text-wm-warning">Away</span>
              </div>
            </div>
          </>
        )}

        {activeModule === 'settings' && (
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
        )}

        {activeModule === 'contacts' && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-4">
            <Users className="h-8 w-8 text-wm-text-muted" />
            <p className="text-center font-mono text-xs text-wm-text-tertiary">Contacts coming soon</p>
          </div>
        )}

        {activeModule === 'analytics' && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-4">
            <BarChart2 className="h-8 w-8 text-wm-text-muted" />
            <p className="text-center font-mono text-xs text-wm-text-tertiary">Analytics coming soon</p>
          </div>
        )}

        {activeModule === 'templates' && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-4">
            <LayoutTemplate className="h-8 w-8 text-wm-text-muted" />
            <p className="text-center font-mono text-xs text-wm-text-tertiary">Templates coming soon</p>
          </div>
        )}

        {/* User info at bottom */}
        <div className="flex items-center gap-2.5 border-t border-wm-border px-3 py-3">
          <Avatar name={user.name} src={user.avatarUrl} size="sm" />
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-xs font-semibold text-wm-text-primary">{user.name}</span>
            <span className="truncate font-mono text-[10px] text-wm-text-tertiary">{user.email}</span>
          </div>
        </div>
      </div>
    </aside>
  )
}
