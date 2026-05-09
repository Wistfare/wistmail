'use client'

import { Hash, MoreHorizontal, Phone, Search, Video } from 'lucide-react'
import { cn, getInitials, stringToColor } from '@/lib/utils'

export interface ConversationHeaderProps {
  kind: 'direct' | 'group'
  /** Counterpart name or group title. */
  title: string
  /** Online indicator / "typing…" / "last seen 5m ago". */
  presence?: string
  avatarUrl?: string | null
  /** Hide call buttons (e.g. for group rooms without dial-in). */
  hideCallActions?: boolean
  onCall?: () => void
  onVideo?: () => void
  onSearch?: () => void
  onMore?: () => void
  className?: string
}

/**
 * V3 thread header — Pencil reference: `ChatViewV3.cHd` (`U41as`).
 *
 *   container: padding [14, 24], 1px bottom #1A1A1A, justify between
 *   cHL (gap 12, alignItems center):
 *     40×40 round avatar (deterministic colour, initials 13/700)
 *       group → bg #6D4AD4, hash icon 18 white
 *     col (gap 1):
 *       title 14/700 white
 *       chS (gap 6) — presence row: green/grey dot + label 11/500
 *   cHR (gap 6):
 *     4 round 36×36 surface (radius 18, bg #111111) buttons —
 *       phone · video · search · ellipsis (icons 14 #999999)
 *
 * The presence string is rendered as a single line; the parent can
 * pass any short status ("Active now" / "typing…" / "last seen 5m ago").
 */
export function ConversationHeader({
  kind,
  title,
  presence,
  avatarUrl,
  hideCallActions,
  onCall,
  onVideo,
  onSearch,
  onMore,
  className,
}: ConversationHeaderProps) {
  const bg = stringToColor(title)
  const initials = getInitials(title)
  return (
    <header
      className={cn(
        'flex w-full items-center justify-between',
        className,
      )}
      style={{
        padding: '14px 24px',
        borderBottom: '1px solid var(--color-wm-border)',
      }}
    >
      <div className="flex min-w-0 items-center" style={{ gap: 12 }}>
        {kind === 'group' ? (
          <span
            aria-hidden
            className="flex shrink-0 items-center justify-center rounded-full text-white"
            style={{ width: 40, height: 40, background: '#6D4AD4' }}
          >
            <Hash style={{ width: 18, height: 18 }} />
          </span>
        ) : avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt=""
            className="shrink-0 rounded-full object-cover"
            style={{ width: 40, height: 40 }}
          />
        ) : (
          <span
            aria-hidden
            className="flex shrink-0 items-center justify-center rounded-full font-mono font-bold text-white"
            style={{
              width: 40,
              height: 40,
              fontSize: 13,
              backgroundColor: bg,
            }}
          >
            {initials || '?'}
          </span>
        )}
        <div className="flex min-w-0 flex-col" style={{ gap: 1 }}>
          <h2
            className="truncate font-mono font-bold text-wm-text-primary"
            style={{ fontSize: 14 }}
          >
            {title}
          </h2>
          {presence && (
            <p
              className="flex items-center truncate font-mono"
              style={{ gap: 6, fontSize: 11, fontWeight: 500, color: '#6e6e6e' }}
            >
              <PresenceDot label={presence} />
              {presence}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center" style={{ gap: 6 }}>
        {!hideCallActions && (
          <>
            <HeaderIc label="Voice call" onClick={onCall}>
              <Phone style={{ width: 14, height: 14 }} />
            </HeaderIc>
            <HeaderIc label="Video call" onClick={onVideo}>
              <Video style={{ width: 14, height: 14 }} />
            </HeaderIc>
          </>
        )}
        <HeaderIc label="Search messages" onClick={onSearch}>
          <Search style={{ width: 14, height: 14 }} />
        </HeaderIc>
        <HeaderIc label="More" onClick={onMore}>
          <MoreHorizontal style={{ width: 14, height: 14 }} />
        </HeaderIc>
      </div>
    </header>
  )
}

function HeaderIc({
  label,
  onClick,
  children,
}: {
  label: string
  onClick?: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex cursor-pointer items-center justify-center bg-wm-surface text-wm-text-secondary transition-colors hover:bg-wm-surface-hover hover:text-wm-text-primary"
      style={{ width: 36, height: 36, borderRadius: 18 }}
    >
      {children}
    </button>
  )
}

/// Presence dot — lime when "active/online", muted otherwise.
function PresenceDot({ label }: { label: string }) {
  const live = /active|online|now|typing/i.test(label)
  return (
    <span
      aria-hidden
      style={{
        width: 6,
        height: 6,
        borderRadius: 999,
        background: live ? 'var(--color-wm-accent)' : '#404040',
      }}
    />
  )
}
