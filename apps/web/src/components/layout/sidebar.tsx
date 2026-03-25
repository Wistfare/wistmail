'use client'

import { usePathname } from 'next/navigation'
import {
  Inbox, Star, Clock, Send, FileText, CalendarClock, ShieldAlert, Trash2,
  Plus, Users, BarChart2, LayoutTemplate, Settings,
} from 'lucide-react'
import { NavItem } from './nav-item'
import { Avatar } from '@/components/ui/avatar'
import { LabelDot } from '@/components/ui/label-dot'
import { ROUTES } from '@/lib/constants'
import { cn } from '@/lib/utils'

export interface SidebarProps {
  user: { name: string; email: string; avatarUrl?: string }
  unreadCounts?: Record<string, number>
  labels?: Array<{ name: string; color: string }>
  className?: string
}

const mailNavItems = [
  { icon: <Inbox className="h-4 w-4" />, label: 'Inbox', href: ROUTES.INBOX, countKey: 'inbox' },
  { icon: <Star className="h-4 w-4" />, label: 'Starred', href: ROUTES.STARRED },
  { icon: <Clock className="h-4 w-4" />, label: 'Snoozed', href: ROUTES.SNOOZED },
  { icon: <Send className="h-4 w-4" />, label: 'Sent', href: ROUTES.SENT },
  { icon: <FileText className="h-4 w-4" />, label: 'Drafts', href: ROUTES.DRAFTS, countKey: 'drafts' },
  { icon: <CalendarClock className="h-4 w-4" />, label: 'Scheduled', href: ROUTES.SCHEDULED, countKey: 'scheduled' },
  { icon: <ShieldAlert className="h-4 w-4" />, label: 'Spam', href: ROUTES.SPAM },
  { icon: <Trash2 className="h-4 w-4" />, label: 'Trash', href: ROUTES.TRASH },
]

const toolNavItems = [
  { icon: <Users className="h-4 w-4" />, label: 'Contacts', href: ROUTES.CONTACTS },
  { icon: <BarChart2 className="h-4 w-4" />, label: 'Analytics', href: ROUTES.ANALYTICS },
  { icon: <LayoutTemplate className="h-4 w-4" />, label: 'Templates', href: ROUTES.TEMPLATES },
  { icon: <Settings className="h-4 w-4" />, label: 'Settings', href: ROUTES.SETTINGS },
]

export function Sidebar({ user, unreadCounts = {}, labels = [], className }: SidebarProps) {
  const pathname = usePathname()

  return (
    <aside className={cn('flex h-full w-60 flex-col border-r border-wm-border bg-wm-surface', className)}>
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 py-6">
        <div className="flex h-7 w-7 items-center justify-center bg-wm-accent">
          <span className="text-base font-bold text-wm-text-on-accent">W</span>
        </div>
        <span className="font-mono text-sm font-semibold tracking-[3px] text-wm-text-primary">
          WISTMAIL
        </span>
      </div>

      {/* Compose */}
      <div className="px-4 pb-4">
        <button className="flex w-full items-center justify-center gap-2 bg-wm-accent px-4 py-2.5 font-mono text-xs font-semibold text-wm-text-on-accent hover:bg-wm-accent-hover transition-colors">
          <Plus className="h-4 w-4" />
          Compose
        </button>
      </div>

      {/* Mail section */}
      <div className="px-4 pb-1">
        <span className="font-mono text-[10px] font-semibold tracking-[2px] text-wm-text-muted">
          MAIL
        </span>
      </div>
      <nav className="flex flex-col">
        {mailNavItems.map((item) => (
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
            <Plus className="h-3 w-3 text-wm-text-muted cursor-pointer hover:text-wm-text-secondary" />
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

      {/* Divider */}
      <div className="mx-4 my-3 h-px bg-wm-border" />

      {/* Tools section */}
      <nav className="flex flex-col">
        {toolNavItems.map((item) => (
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

      {/* Chat section */}
      <div className="flex items-center justify-between px-4 pb-1">
        <span className="font-mono text-[10px] font-semibold tracking-[2px] text-wm-text-muted">
          CHAT
        </span>
        <Plus className="h-3 w-3 text-wm-text-muted cursor-pointer hover:text-wm-text-secondary" />
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

      {/* User profile */}
      <div className="flex items-center gap-2.5 border-t border-wm-border bg-wm-surface-hover px-3 py-3">
        <Avatar name={user.name} src={user.avatarUrl} size="md" />
        <div className="flex flex-col">
          <span className="text-xs font-semibold text-wm-text-primary">{user.name}</span>
          <span className="font-mono text-[10px] text-wm-text-tertiary">{user.email}</span>
        </div>
      </div>
    </aside>
  )
}
