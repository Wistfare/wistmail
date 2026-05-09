'use client'

import Link from 'next/link'
import { cn } from '@/lib/utils'
import { Tooltip } from '@/components/ui'

/**
 * IconRail — left-most 56px column on every authenticated screen.
 *
 * Pencil reference: `Component/SidebarV2.iconRail` (`JFvLu`).
 * - 56px wide, bg #000000, padding [12, 0], gap 2 vertical
 * - 1px right border #1A1A1A
 * - Logo at top: 32×32 lime square, "W" in Inter 14px 700 black
 * - 1px hairline separator
 * - IconRailItem(Active): 56×48 frame; inner 40×36 frame with icon 20×20
 *   - Active: inner bg #1A2200, icon #BFFF00
 *   - Inactive: inner bg transparent, icon #6E6E6E
 * - Spacer (fill_container) pushes settings + avatar to bottom
 * - Settings IconRailItem
 * - User avatar at very bottom: 32×32 round, lime fill, white initial
 */

export interface IconRailItem {
  href: string
  icon: React.ReactNode
  label: string
  match?: (pathname: string) => boolean
}

export interface IconRailProps {
  topItems: IconRailItem[]
  bottomItems?: IconRailItem[]
  pathname: string
  user: { name: string; avatarUrl?: string | null }
  /** Optional click handler on the avatar (e.g. open user menu). */
  onAvatarClick?: () => void
}

function isActive(item: IconRailItem, pathname: string): boolean {
  if (item.match) return item.match(pathname)
  return pathname === item.href || pathname.startsWith(item.href + '/')
}

export function IconRail({ topItems, bottomItems = [], pathname, user, onAvatarClick }: IconRailProps) {
  return (
    <nav
      aria-label="Modules"
      className="flex w-14 shrink-0 flex-col items-center gap-0.5 border-r border-wm-border bg-wm-bg py-3"
    >
      {/* Logo — links to root */}
      <Tooltip side="right" content="Wistfare Mail">
        <Link
          href="/"
          aria-label="Wistfare Mail home"
          className="mb-2 flex h-8 w-8 items-center justify-center bg-wm-accent text-wm-text-on-accent"
        >
          <span className="font-sans text-sm font-bold">W</span>
        </Link>
      </Tooltip>

      {/* 1px hairline separator (Pencil railSpacer1: 32×1 #1A1A1A) */}
      <div className="mb-1 h-px w-8 bg-wm-border" aria-hidden />

      <div className="flex flex-col items-center gap-0.5">
        {topItems.map((it) => (
          <IconRailLink key={it.href} item={it} active={isActive(it, pathname)} />
        ))}
      </div>

      <div className="flex-1" />

      <div className="flex flex-col items-center gap-0.5">
        {bottomItems.map((it) => (
          <IconRailLink key={it.href} item={it} active={isActive(it, pathname)} />
        ))}
      </div>

      {/* User avatar — round 32×32 lime */}
      <Tooltip side="right" content={user.name}>
        <button
          type="button"
          onClick={onAvatarClick}
          aria-label={`Account: ${user.name}`}
          className="mt-2 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-wm-accent font-sans text-xs font-semibold text-wm-text-on-accent"
        >
          {user.name
            .split(' ')
            .map((p) => p[0])
            .filter(Boolean)
            .slice(0, 2)
            .join('')
            .toUpperCase() || 'U'}
        </button>
      </Tooltip>
    </nav>
  )
}

function IconRailLink({ item, active }: { item: IconRailItem; active: boolean }) {
  return (
    <Tooltip side="right" content={item.label}>
      <Link
        href={item.href}
        aria-label={item.label}
        aria-current={active ? 'page' : undefined}
        className={cn(
          // Pencil: outer 56×48 frame; we use w-14 from parent fixed width
          // and a 48px tall click target.
          'flex h-12 w-14 items-center justify-center',
        )}
      >
        <span
          className={cn(
            // Inner 40×36 frame
            'flex h-9 w-10 items-center justify-center transition-colors',
            active
              ? 'bg-wm-accent-dim text-wm-accent'
              : 'text-wm-text-tertiary hover:bg-wm-surface-hover hover:text-wm-text-secondary',
          )}
        >
          {item.icon}
        </span>
      </Link>
    </Tooltip>
  )
}
