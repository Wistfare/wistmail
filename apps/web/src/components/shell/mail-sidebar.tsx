'use client'

import {
  Inbox,
  Star,
  AlarmClock,
  Send,
  FileText,
  CalendarClock,
  ShieldAlert,
  Trash2,
  Plus,
} from 'lucide-react'
import { useSearchParams, usePathname } from 'next/navigation'
import {
  SidebarShell,
  SidebarSection,
  SidebarNavItem,
  SidebarLabelItem,
  SidebarComposeButton,
} from './sidebar-shell'
import { useLabels } from '@/lib/labels'
import { useCompose } from '@/components/email/compose-provider'

export interface MailSidebarProps {
  user: { name: string; email: string; avatarUrl?: string | null }
  unreadCounts?: { inbox?: number; drafts?: number; scheduled?: number }
  onUserMenu?: () => void
}

/**
 * Pencil reference: `Component/SidebarV2.detailPanel` in Mail mode.
 * Mail folders + Labels + bottom user pill.
 */
export function MailSidebar({ unreadCounts = {} }: MailSidebarProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { openCompose } = useCompose()
  const folder = searchParams.get('folder') || (pathname === '/inbox' ? 'inbox' : '')

  const labelsQuery = useLabels()
  const labels = (labelsQuery.data ?? []).map((l) => ({ name: l.name, color: l.color }))

  const isFolder = (f: string) =>
    pathname.startsWith('/inbox') && (folder === f || (f === 'inbox' && folder === ''))

  return (
    <SidebarShell
      cta={<SidebarComposeButton onClick={() => openCompose()}>Compose</SidebarComposeButton>}
    >
      <SidebarSection label="Mail">
        <SidebarNavItem
          href="/inbox"
          icon={<Inbox className="h-[18px] w-[18px]" />}
          label="Inbox"
          active={isFolder('inbox')}
          count={unreadCounts.inbox}
        />
        <SidebarNavItem
          href="/inbox?folder=starred"
          icon={<Star className="h-[18px] w-[18px]" />}
          label="Starred"
          active={isFolder('starred')}
        />
        <SidebarNavItem
          href="/inbox?folder=snoozed"
          icon={<AlarmClock className="h-[18px] w-[18px]" />}
          label="Snoozed"
          active={isFolder('snoozed')}
        />
        <SidebarNavItem
          href="/inbox?folder=sent"
          icon={<Send className="h-[18px] w-[18px]" />}
          label="Sent"
          active={isFolder('sent')}
        />
        <SidebarNavItem
          href="/inbox?folder=drafts"
          icon={<FileText className="h-[18px] w-[18px]" />}
          label="Drafts"
          active={isFolder('drafts')}
          count={unreadCounts.drafts}
        />
        <SidebarNavItem
          href="/inbox?folder=scheduled"
          icon={<CalendarClock className="h-[18px] w-[18px]" />}
          label="Scheduled"
          active={isFolder('scheduled')}
          count={unreadCounts.scheduled}
        />
        <SidebarNavItem
          href="/inbox?folder=spam"
          icon={<ShieldAlert className="h-[18px] w-[18px]" />}
          label="Spam"
          active={isFolder('spam')}
        />
        <SidebarNavItem
          href="/inbox?folder=trash"
          icon={<Trash2 className="h-[18px] w-[18px]" />}
          label="Trash"
          active={isFolder('trash')}
        />
      </SidebarSection>

      <SidebarSection
        label="Labels"
        adornment={
          <button
            type="button"
            aria-label="Create label"
            className="cursor-pointer text-wm-text-muted hover:text-wm-text-secondary"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        }
      >
        {labels.length === 0 ? (
          <p className="px-3 py-2 font-mono text-[11px] text-wm-text-muted">No labels yet</p>
        ) : (
          labels.map((l) => (
            <SidebarLabelItem
              key={l.name}
              href={`/inbox?label=${encodeURIComponent(l.name)}`}
              color={l.color}
              name={l.name}
              active={searchParams.get('label') === l.name}
            />
          ))
        )}
      </SidebarSection>
    </SidebarShell>
  )
}
