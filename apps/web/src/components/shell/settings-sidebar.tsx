'use client'

import { usePathname } from 'next/navigation'
import {
  User,
  ShieldCheck,
  PenLine,
  HardDrive,
  Bell,
  Tag,
  Globe,
  Key,
  Webhook,
  Cpu,
} from 'lucide-react'
import {
  SidebarShell,
  SidebarSection,
  SidebarNavItem,
} from './sidebar-shell'

export interface SettingsSidebarProps {
  user: { name: string; email: string }
  onUserMenu?: () => void
}

/**
 * Pencil reference: `SettingsV3-Account` (`QWQRT`) left nav, grouped as
 * Profile / Security / Mail / Developer.
 */
export function SettingsSidebar({}: SettingsSidebarProps) {
  const pathname = usePathname()
  const is = (href: string) => pathname === href || pathname.startsWith(href + '/')
  return (
    <SidebarShell>
      <SidebarSection label="Profile">
        <SidebarNavItem
          href="/settings/account"
          icon={<User className="h-[18px] w-[18px]" />}
          label="Account"
          active={is('/settings/account')}
        />
        <SidebarNavItem
          href="/settings/two-factor"
          icon={<ShieldCheck className="h-[18px] w-[18px]" />}
          label="Two-factor"
          active={is('/settings/two-factor')}
        />
        <SidebarNavItem
          href="/settings/notifications"
          icon={<Bell className="h-[18px] w-[18px]" />}
          label="Notifications"
          active={is('/settings/notifications')}
        />
        <SidebarNavItem
          href="/settings/storage"
          icon={<HardDrive className="h-[18px] w-[18px]" />}
          label="Storage"
          active={is('/settings/storage')}
        />
      </SidebarSection>
      <SidebarSection label="Mail">
        <SidebarNavItem
          href="/settings/signatures"
          icon={<PenLine className="h-[18px] w-[18px]" />}
          label="Signatures"
          active={is('/settings/signatures')}
        />
        <SidebarNavItem
          href="/settings/labels"
          icon={<Tag className="h-[18px] w-[18px]" />}
          label="Labels"
          active={is('/settings/labels')}
        />
        <SidebarNavItem
          href="/settings/domains"
          icon={<Globe className="h-[18px] w-[18px]" />}
          label="Domains"
          active={is('/settings/domains')}
        />
        <SidebarNavItem
          href="/settings/ai"
          icon={<Cpu className="h-[18px] w-[18px]" />}
          label="AI"
          active={is('/settings/ai')}
        />
      </SidebarSection>
      <SidebarSection label="Developer">
        <SidebarNavItem
          href="/settings/api-keys"
          icon={<Key className="h-[18px] w-[18px]" />}
          label="API keys"
          active={is('/settings/api-keys')}
        />
        <SidebarNavItem
          href="/settings/webhooks"
          icon={<Webhook className="h-[18px] w-[18px]" />}
          label="Webhooks"
          active={is('/settings/webhooks')}
        />
      </SidebarSection>
    </SidebarShell>
  )
}
