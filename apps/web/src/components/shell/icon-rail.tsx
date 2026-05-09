'use client'

import Image from 'next/image'
import Link from 'next/link'
import { cn } from '@/lib/utils'

/**
 * IconRail — Pencil reference: `Screen/InboxV3.iconRail` (`heGq7`).
 *
 *   container: width 72, fill #111111, padding [20, 0], gap 8,
 *     vertical layout, 1px right hairline #1A1A1A, alignItems center.
 *
 *   children (top → bottom):
 *     1. logo (`nCoRJ`) — 40×40, cornerRadius 12, image fill
 *        `wistfare_mail_logo.png` (mode fit). Linked to /inbox.
 *     2. sp1 (`AkpDt`) — 1×20 spacer (extra 20-px gap below logo).
 *     3. nav tiles (`wSw6C` / `cxjrY` / `dEP5y`) — 48×48, cornerRadius 14:
 *          active → fill lime, icon 20 BLACK
 *          idle   → fill #111111 (flat with rail), icon 20 #999999
 *          hover  → icon lifts to #FFFFFF
 *     4. flex spacer pushes the avatar to the bottom.
 *     5. avatar (`QK4fW`) — 40×40 fully rounded, fill #1B6FE0, centered
 *        initials in JetBrains Mono 14/700 white.
 *
 * The Pencil mock shows three nav items (Inbox / Calendar / Work). The
 * component itself just renders whatever the parent passes via
 * `topItems` so callers control the list.
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

export function IconRail({
  topItems,
  bottomItems = [],
  pathname,
  user,
  onAvatarClick,
}: IconRailProps) {
  return (
    <nav
      aria-label="Modules"
      className="flex shrink-0 flex-col items-center"
      style={{
        width: 72,
        background: '#111111',
        padding: '20px 0',
        gap: 8,
        borderRight: '1px solid var(--color-wm-border)',
      }}
    >
      {/* (1) logo — Pencil `nCoRJ`: 40×40, cornerRadius 12, fit image.
          No tooltip — Pencil's iconRail surfaces no on-hover label, so
          the logo and nav tiles are plain links. Screen readers still
          get the aria-label for accessibility. */}
      <Link
        href="/inbox"
        aria-label="Wistfare Mail home"
        className="relative shrink-0 overflow-hidden"
        style={{ width: 40, height: 40, borderRadius: 12 }}
      >
        <Image
          src="/wistfare_mail_logo.png"
          alt=""
          fill
          sizes="40px"
          className="object-contain"
          priority
        />
      </Link>

      {/* (2) sp1 — Pencil `AkpDt`: 1×20 spacer. The parent gap is 8,
          so adding a 20-px-tall invisible block pushes the next item
          down by 20px (8 gap above + 8 gap below + 20 spacer = 36px
          between logo and first nav tile, same as Pencil). */}
      <span aria-hidden style={{ height: 20, width: 1 }} />

      {/* (3) top nav tiles */}
      {topItems.map((it) => (
        <NavTile key={it.href} item={it} active={isActive(it, pathname)} />
      ))}

      {/* (4) flex spacer pushes the rest to the bottom. */}
      <span aria-hidden style={{ flex: 1 }} />

      {/* Optional bottom nav tiles. Pencil's static InboxV3 frame has
          none, but other modules (e.g. admin) may want secondary
          actions in the same shape — we render them just above the
          avatar. */}
      {bottomItems.map((it) => (
        <NavTile key={it.href} item={it} active={isActive(it, pathname)} />
      ))}

      {/* (5) avatar — Pencil `QK4fW`: 40×40 round, fill #1B6FE0, "V" 14/700 white. */}
      <button
        type="button"
        onClick={onAvatarClick}
        aria-label={`Account: ${user.name || 'guest'}`}
        className="flex shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full font-mono font-bold text-white transition-opacity hover:opacity-90"
        style={{
          width: 40,
          height: 40,
          fontSize: 14,
          background: '#1B6FE0',
        }}
      >
        {user.avatarUrl ? (
          <Image
            src={user.avatarUrl}
            alt=""
            width={40}
            height={40}
            className="object-cover"
          />
        ) : (
          initials(user.name)
        )}
      </button>
    </nav>
  )
}

/**
 * Pencil nav tile (`wSw6C` / `cxjrY` / `dEP5y`): 48×48 cornerRadius 14
 * with centered 20-px icon. Active = lime fill + black icon, idle =
 * #111111 fill + #999999 icon, hover lifts the icon to white.
 */
function NavTile({ item, active }: { item: IconRailItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      aria-label={item.label}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex shrink-0 items-center justify-center transition-colors',
        active
          ? 'bg-wm-accent text-wm-text-on-accent'
          : 'bg-wm-surface text-wm-text-secondary hover:text-wm-text-primary',
      )}
      style={{ width: 48, height: 48, borderRadius: 14 }}
    >
      {item.icon}
    </Link>
  )
}

function initials(name: string): string {
  const parts = name
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
  return parts.slice(0, 2).join('').toUpperCase() || 'U'
}
