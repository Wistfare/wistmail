'use client'

import { usePathname } from 'next/navigation'
import { Video, History } from 'lucide-react'
import {
  SidebarShell,
  SidebarSection,
  SidebarNavItem,
  SidebarComposeButton,
} from './sidebar-shell'

export interface MeetingsSidebarProps {
  user: { name: string; email: string }
  upcoming?: Array<{ id: string; title: string; startsAt: string }>
  onCreate?: () => void
  onUserMenu?: () => void
}

/** Pencil reference: `MeetingsV3` (`RTarH`) left panel. */
export function MeetingsSidebar({
  upcoming = [],
  onCreate,
}: MeetingsSidebarProps) {
  const pathname = usePathname()
  return (
    <SidebarShell
      cta={<SidebarComposeButton onClick={onCreate}>New meeting</SidebarComposeButton>}
    >
      <SidebarSection label="Meetings">
        <SidebarNavItem
          href="/meetings"
          icon={<Video className="h-[18px] w-[18px]" />}
          label="Upcoming"
          active={pathname === '/meetings'}
        />
        <SidebarNavItem
          href="/meetings?filter=recent"
          icon={<History className="h-[18px] w-[18px]" />}
          label="Recent"
        />
      </SidebarSection>
      {upcoming.length > 0 && (
        <SidebarSection label="Today">
          {upcoming.map((m) => (
            <SidebarNavItem
              key={m.id}
              href={`/meetings/${m.id}`}
              icon={<Video className="h-[18px] w-[18px]" />}
              label={m.title}
              active={pathname === `/meetings/${m.id}`}
            />
          ))}
        </SidebarSection>
      )}
    </SidebarShell>
  )
}
