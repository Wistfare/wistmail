'use client'

import Link from 'next/link'
import { cn } from '@/lib/utils'

export interface NavItemProps {
  icon: React.ReactNode
  label: string
  href: string
  badge?: number
  active?: boolean
  className?: string
}

export function NavItem({ icon, label, href, badge, active, className }: NavItemProps) {
  return (
    <Link
      href={href}
      className={cn(
        'flex items-center gap-2.5 px-3 py-2 font-mono text-xs transition-colors',
        active
          ? 'border-l-2 border-wm-accent bg-wm-accent-dim text-wm-accent font-medium'
          : 'text-wm-text-tertiary hover:bg-wm-surface-hover',
        className,
      )}
    >
      <span className="flex-shrink-0">{icon}</span>
      <span>{label}</span>
      <span className="flex-1" />
      {badge !== undefined && badge > 0 && (
        <span className="bg-wm-accent px-1.5 py-0.5 font-mono text-[10px] font-bold text-wm-text-on-accent">
          {badge}
        </span>
      )}
    </Link>
  )
}
