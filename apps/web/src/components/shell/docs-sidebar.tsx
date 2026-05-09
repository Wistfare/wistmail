'use client'

import { usePathname } from 'next/navigation'
import { FileText } from 'lucide-react'
import {
  SidebarShell,
  SidebarSection,
  SidebarNavItem,
  SidebarComposeButton,
  SidebarUser,
} from './sidebar-shell'

export interface DocsSidebarProps {
  user: { name: string; email: string }
  spaces?: Array<{ id: string; name: string; emoji?: string }>
  onNewDoc?: () => void
  onUserMenu?: () => void
}

/** Pencil reference: `DocsV3` (`sOpka`) left panel. */
export function DocsSidebar({ user, spaces = [], onNewDoc, onUserMenu }: DocsSidebarProps) {
  const pathname = usePathname()
  return (
    <SidebarShell
      cta={<SidebarComposeButton onClick={onNewDoc}>New doc</SidebarComposeButton>}
      footer={<SidebarUser name={user.name} email={user.email} onClick={onUserMenu} />}
    >
      <SidebarSection label="Docs">
        <SidebarNavItem
          href="/docs"
          icon={<FileText className="h-[18px] w-[18px]" />}
          label="All docs"
          active={pathname === '/docs'}
        />
      </SidebarSection>
      {spaces.length > 0 && (
        <SidebarSection label="Spaces">
          {spaces.map((s) => (
            <SidebarNavItem
              key={s.id}
              href={`/docs/spaces/${s.id}`}
              icon={
                <span className="font-sans text-[13px] leading-none">
                  {s.emoji ?? <FileText className="h-[18px] w-[18px]" />}
                </span>
              }
              label={s.name}
              active={pathname === `/docs/spaces/${s.id}`}
            />
          ))}
        </SidebarSection>
      )}
    </SidebarShell>
  )
}
