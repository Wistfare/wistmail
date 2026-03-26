'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { User, Globe, Key, PenLine, Sparkles, Building2, ScrollText, Users } from 'lucide-react'
import { cn } from '@/lib/utils'

const SETTINGS_NAV = [
  { label: 'GENERAL', items: [
    { href: '/settings/account', icon: User, label: 'Account' },
    { href: '/settings/domains', icon: Globe, label: 'Domains' },
    { href: '/settings/signatures', icon: PenLine, label: 'Signatures' },
    { href: '/settings/ai', icon: Sparkles, label: 'AI' },
  ]},
  { label: 'DEVELOPER', items: [
    { href: '/settings/api-keys', icon: Key, label: 'API Keys' },
  ]},
  { label: 'ADMIN', items: [
    { href: '/admin/organization', icon: Building2, label: 'Organization' },
    { href: '/admin/members', icon: Users, label: 'Members' },
    { href: '/admin/audit-logs', icon: ScrollText, label: 'Audit Logs' },
  ]},
]

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="flex h-full">
      {/* Settings side panel */}
      <div className="w-56 shrink-0 border-r border-wm-border bg-wm-bg p-4">
        <h2 className="mb-4 px-3 text-lg font-semibold text-wm-text-primary">Settings</h2>

        {SETTINGS_NAV.map((group) => (
          <div key={group.label} className="mb-4">
            <p className="mb-1 px-3 font-mono text-[10px] font-semibold tracking-wider text-wm-text-muted">
              {group.label}
            </p>
            {group.items.map((item) => {
              const Icon = item.icon
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-2.5 px-3 py-2 font-mono text-xs transition-colors',
                    isActive
                      ? 'bg-wm-accent/10 text-wm-accent'
                      : 'text-wm-text-tertiary hover:bg-wm-surface-hover hover:text-wm-text-secondary',
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              )
            })}
          </div>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-8">
        {children}
      </div>
    </div>
  )
}
