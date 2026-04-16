'use client'

import { useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Inbox, Star, Clock, Send, FileText, CalendarClock, ShieldAlert, Trash2,
  Plus, Mail, Settings, LogOut, Users, Building2, ScrollText,
} from 'lucide-react'
import { NavItem } from './nav-item'
import { Avatar } from '@/components/ui/avatar'
import { LabelDot } from '@/components/ui/label-dot'
import { ROUTES } from '@/lib/constants'
import { api } from '@/lib/api-client'
import { cn } from '@/lib/utils'

export interface SidebarProps {
  user: { name: string; email: string; avatarUrl?: string; role?: string }
  activeRoute?: string
  unreadCounts?: Record<string, number>
  labels?: Array<{ name: string; color: string }>
  className?: string
}

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

const ADMIN_NAV = [
  { icon: <Users className="h-4 w-4" />, label: 'Users', href: '/admin/members' },
  { icon: <Building2 className="h-4 w-4" />, label: 'Organization', href: '/admin/organization' },
  { icon: <Settings className="h-4 w-4" />, label: 'Settings', href: '/admin/settings' },
  { icon: <ScrollText className="h-4 w-4" />, label: 'Audit Log', href: '/admin/audit-logs' },
]

const DEFAULT_LABELS = [
  { name: 'Primary', color: 'var(--color-wm-accent)' },
  { name: 'Updates', color: 'var(--color-wm-info)' },
  { name: 'Promotions', color: 'var(--color-wm-warning)' },
  { name: 'Newsletters', color: '#A78BFA' },
]

export function Sidebar({ user, unreadCounts = {}, labels, className }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [showUserMenu, setShowUserMenu] = useState(false)
  const isAdmin = user.role === 'owner' || user.role === 'admin'
  const isOnAdmin = pathname.startsWith('/admin') || pathname.startsWith('/settings')
  const displayLabels = labels && labels.length > 0 ? labels : DEFAULT_LABELS

  async function handleLogout() {
    try {
      await api.post('/api/v1/auth/logout')
    } catch {}
    router.push('/login')
  }

  return (
    <aside className={cn('flex h-full shrink-0', className)}>
      {/* ── Icon Rail ── */}
      <div className="flex w-14 flex-col items-center border-r border-wm-border bg-wm-bg py-3 gap-0.5">
        {/* Logo */}
        <Link href="/" className="mb-3 flex h-8 w-8 items-center justify-center bg-wm-accent">
          <span className="text-sm font-bold text-wm-text-on-accent">W</span>
        </Link>

        <div className="h-px w-8 bg-wm-border mb-1" />

        {/* Mail icon */}
        <Link
          href={ROUTES.INBOX}
          className="flex h-12 w-14 items-center justify-center"
          title="Mail"
        >
          <div className={cn(
            'flex h-9 w-10 items-center justify-center',
            !isOnAdmin ? 'bg-wm-accent/15' : 'hover:bg-wm-surface-hover',
          )}>
            <Mail className={cn(
              'h-5 w-5',
              !isOnAdmin ? 'text-wm-accent' : 'text-wm-text-muted',
            )} />
          </div>
        </Link>

        <div className="flex-1" />

        {/* Settings icon — admin only */}
        {isAdmin && (
          <Link
            href="/admin/members"
            className="flex h-12 w-14 items-center justify-center"
            title="Admin"
          >
            <div className={cn(
              'flex h-9 w-10 items-center justify-center',
              isOnAdmin ? 'bg-wm-accent/15' : 'hover:bg-wm-surface-hover',
            )}>
              <Settings className={cn(
                'h-5 w-5',
                isOnAdmin ? 'text-wm-accent' : 'text-wm-text-muted',
              )} />
            </div>
          </Link>
        )}

        {/* User avatar with popup */}
        <div className="relative">
          <button onClick={() => setShowUserMenu(!showUserMenu)} className="cursor-pointer">
            <Avatar name={user.name} src={user.avatarUrl} size="sm" />
          </button>

          {showUserMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
              <div className="absolute bottom-10 left-0 z-50 w-56 border border-wm-border bg-wm-surface shadow-lg">
                <div className="border-b border-wm-border px-4 py-3">
                  <p className="text-sm font-medium text-wm-text-primary">{user.name}</p>
                  <p className="font-mono text-[10px] text-wm-text-muted">{user.email}</p>
                </div>
                <div className="flex flex-col py-1">
                  <Link href="/settings/account" onClick={() => setShowUserMenu(false)} className="flex items-center gap-2 px-4 py-2 text-xs text-wm-text-secondary hover:bg-wm-surface-hover">
                    <Settings className="h-3.5 w-3.5" />
                    Account Settings
                  </Link>
                  {isAdmin && (
                    <Link href="/admin/members" onClick={() => setShowUserMenu(false)} className="flex items-center gap-2 px-4 py-2 text-xs text-wm-text-secondary hover:bg-wm-surface-hover">
                      <Settings className="h-3.5 w-3.5 text-wm-accent" />
                      Admin Panel
                    </Link>
                  )}
                </div>
                <div className="border-t border-wm-border py-1">
                  <button onClick={handleLogout} className="flex w-full cursor-pointer items-center gap-2 px-4 py-2 text-xs text-wm-error hover:bg-wm-surface-hover">
                    <LogOut className="h-3.5 w-3.5" />
                    Log out
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Detail Panel ── */}
      <div className="flex w-[180px] flex-col border-r border-wm-border bg-wm-surface">
        {isOnAdmin ? (
          /* ── ADMIN MODE ── */
          <>
            <div className="px-4 pb-1 pt-4">
              <span className="font-mono text-[10px] font-semibold tracking-[1px] text-wm-text-muted">ADMIN</span>
            </div>

            <nav className="flex flex-col">
              {ADMIN_NAV.map((item) => (
                <NavItem
                  key={item.href}
                  icon={item.icon}
                  label={item.label}
                  href={item.href}
                  active={pathname === item.href || pathname.startsWith(item.href + '/')}
                />
              ))}
            </nav>
          </>
        ) : (
          /* ── MAIL MODE ── */
          <>
            {/* Compose button */}
            <div className="px-3 pt-4 pb-2">
              <Link
                href="/compose"
                className="flex w-full items-center justify-center gap-2 bg-wm-accent px-4 py-2.5 font-mono text-[13px] font-semibold text-wm-text-on-accent transition-colors hover:bg-wm-accent-hover"
              >
                <Plus className="h-4 w-4" />
                Compose
              </Link>
            </div>

            <div className="px-4 pb-1 pt-3">
              <span className="font-sans text-[10px] font-semibold tracking-[2px] text-wm-text-muted">MAIL</span>
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
            <div className="flex items-center justify-between px-4 pb-1 pt-4">
              <span className="font-sans text-[10px] font-semibold tracking-[2px] text-wm-text-muted">LABELS</span>
              <Plus className="h-3.5 w-3.5 cursor-pointer text-wm-text-muted hover:text-wm-text-secondary" />
            </div>
            <div className="flex flex-col">
              {displayLabels.map((label) => (
                <button key={label.name} className="flex items-center gap-2 px-5 py-1.5 text-left hover:bg-wm-surface-hover">
                  <LabelDot color={label.color} label={label.name} />
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </aside>
  )
}
