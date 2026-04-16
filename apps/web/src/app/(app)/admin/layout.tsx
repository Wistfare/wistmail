'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Users, Building2, Settings, ScrollText, ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'

const ADMIN_NAV = [
  { icon: Users, label: 'Users', href: '/admin/members' },
  { icon: Building2, label: 'Organization', href: '/admin/organization' },
  { icon: Settings, label: 'Settings', href: '/admin/settings' },
  { icon: ScrollText, label: 'Audit Log', href: '/admin/audit-logs' },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="flex h-full">
      {/* Admin sidebar */}
      <div className="flex w-[200px] shrink-0 flex-col border-r border-wm-border bg-wm-surface">
        <div className="px-3 pt-3 pb-2">
          <Link
            href="/inbox"
            className="flex w-full items-center gap-2 px-3 py-2 font-mono text-xs text-wm-text-muted hover:text-wm-text-secondary transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Mail
          </Link>
        </div>

        <div className="px-4 pb-1 pt-2">
          <span className="font-sans text-[10px] font-semibold tracking-[2px] text-wm-text-muted">ADMIN</span>
        </div>

        <nav className="flex flex-col">
          {ADMIN_NAV.map((item) => {
            const Icon = item.icon
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-2.5 px-4 py-2 font-mono text-[11px] transition-colors',
                  isActive
                    ? 'border-l-2 border-wm-accent bg-wm-accent/10 font-medium text-wm-accent'
                    : 'text-wm-text-secondary hover:bg-wm-surface-hover hover:text-wm-text-primary',
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            )
          })}
        </nav>
      </div>

      {/* Admin content */}
      <div className="flex-1 overflow-y-auto p-8">{children}</div>
    </div>
  )
}
