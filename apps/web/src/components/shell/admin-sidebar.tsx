'use client'

import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Users,
  Globe,
  Building2,
  ShieldCheck,
  ScrollText,
  CreditCard,
} from 'lucide-react'
import {
  SidebarShell,
  SidebarSection,
  SidebarNavItem,
} from './sidebar-shell'

export interface AdminSidebarProps {
  user: { name: string; email: string }
  onUserMenu?: () => void
}

/** Pencil reference: `AdminV3-Overview` (`boHfA`) left nav. */
export function AdminSidebar({}: AdminSidebarProps) {
  const pathname = usePathname()
  const is = (href: string) => pathname === href || pathname.startsWith(href + '/')
  return (
    <SidebarShell>
      <SidebarSection label="Workspace">
        <SidebarNavItem
          href="/admin"
          icon={<LayoutDashboard className="h-[18px] w-[18px]" />}
          label="Overview"
          active={pathname === '/admin'}
        />
        <SidebarNavItem
          href="/admin/users"
          icon={<Users className="h-[18px] w-[18px]" />}
          label="Users"
          active={is('/admin/users') || is('/admin/members')}
        />
        <SidebarNavItem
          href="/admin/domains"
          icon={<Globe className="h-[18px] w-[18px]" />}
          label="Domains"
          active={is('/admin/domains')}
        />
        <SidebarNavItem
          href="/admin/organization"
          icon={<Building2 className="h-[18px] w-[18px]" />}
          label="Organization"
          active={is('/admin/organization')}
        />
      </SidebarSection>
      <SidebarSection label="Observability">
        <SidebarNavItem
          href="/admin/audit-logs"
          icon={<ScrollText className="h-[18px] w-[18px]" />}
          label="Audit log"
          active={is('/admin/audit-logs')}
        />
        <SidebarNavItem
          href="/admin/security"
          icon={<ShieldCheck className="h-[18px] w-[18px]" />}
          label="Security"
          active={is('/admin/security')}
        />
      </SidebarSection>
      <SidebarSection label="Billing">
        <SidebarNavItem
          href="/admin/plan"
          icon={<CreditCard className="h-[18px] w-[18px]" />}
          label="Plan & usage"
          active={is('/admin/plan')}
        />
      </SidebarSection>
    </SidebarShell>
  )
}
