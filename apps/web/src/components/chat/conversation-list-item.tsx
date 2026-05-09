'use client'

import Link from 'next/link'
import { Hash } from 'lucide-react'
import { cn, formatRelativeTime, getInitials, stringToColor } from '@/lib/utils'

export interface ConversationListItemProps {
  href: string
  /** Direct chat: counterpart's name. Group: group title. */
  title: string
  /** "direct" → avatar; "group" → hash icon. */
  kind: 'direct' | 'group'
  preview?: string
  /** Last activity timestamp (ISO). */
  timestamp?: string
  unread?: number
  active?: boolean
  /** Avatar URL for direct chats. */
  avatarUrl?: string | null
  /** When true, italicize preview as "Draft: …". */
  isDraft?: boolean
}

/**
 * V3 conversation row in the left list — Pencil reference: `ChatViewV3`
 * rows (`r1`–`r5` under `tUrQl`).
 *
 *   container: padding [10, 20], gap 12, alignItems center
 *     active: bg #1A2200, 3-px lime LEFT stroke
 *     hover:  bg #1A1A1A
 *     idle:   transparent
 *   avatar: 40×40 round
 *     direct  → deterministic colour fill, initials 13/700 white
 *     group   → bg #6D4AD4, hash icon 18 white
 *   col (gap 3 vertical):
 *     header (justify between):
 *       name (truncate) 13/600 white
 *       time 11 #6e6e6e
 *     bottom (justify between):
 *       preview 12/normal #999999 (truncate)
 *       unread chip — bg lime, 9/700 black, padding [1,6], radius 999
 *
 * Bold-on-unread treatment: when `unread > 0` and the message is from
 * someone other than the current user, Pencil bumps the preview to
 * 12/600 white (see Pencil row3 `Q0Lf9f`). Our heuristic mirrors that:
 * if the preview doesn't start with "You: " or `isDraft`, we treat it
 * as inbound and apply the bold styling.
 */
export function ConversationListItem({
  href,
  title,
  kind,
  preview,
  timestamp,
  unread,
  active,
  avatarUrl,
  isDraft,
}: ConversationListItemProps) {
  const hasUnread = !!unread && unread > 0
  const previewIsInbound =
    !isDraft && !!preview && !preview.toLowerCase().startsWith('you:')
  const bg = stringToColor(title)
  const initials = getInitials(title)

  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group flex w-full items-center transition-colors',
        active
          ? 'bg-wm-accent-dim'
          : 'hover:bg-wm-surface-hover',
      )}
      style={{
        padding: '10px 20px',
        gap: 12,
        borderLeft: active
          ? '3px solid var(--color-wm-accent)'
          : '3px solid transparent',
      }}
    >
      {/* Avatar slot — direct → coloured initials; group → hash icon. */}
      {kind === 'group' ? (
        <span
          aria-hidden
          className="flex shrink-0 items-center justify-center rounded-full text-white"
          style={{
            width: 40,
            height: 40,
            background: '#6D4AD4',
          }}
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

      <span
        className="flex min-w-0 flex-1 flex-col"
        style={{ gap: 3 }}
      >
        <span className="flex w-full items-center justify-between" style={{ gap: 8 }}>
          <span
            className="min-w-0 truncate font-mono font-semibold text-wm-text-primary"
            style={{ fontSize: 13 }}
          >
            {title}
          </span>
          {timestamp && (
            <span
              className="shrink-0 font-mono"
              style={{ fontSize: 11, color: '#6e6e6e' }}
            >
              {formatRelativeTime(new Date(timestamp))}
            </span>
          )}
        </span>
        <span className="flex w-full items-center justify-between" style={{ gap: 8 }}>
          <span className="flex min-w-0 items-center" style={{ gap: 6 }}>
            {isDraft && (
              <span
                className="font-mono font-bold uppercase text-wm-warning"
                style={{ fontSize: 9, letterSpacing: 1 }}
              >
                Draft
              </span>
            )}
            <span
              className={cn(
                'truncate font-mono',
                isDraft
                  ? 'italic'
                  : hasUnread && previewIsInbound
                    ? 'font-semibold'
                    : '',
              )}
              style={{
                fontSize: 12,
                color: isDraft
                  ? '#6e6e6e'
                  : hasUnread && previewIsInbound
                    ? '#FFFFFF'
                    : '#999999',
              }}
            >
              {preview}
            </span>
          </span>
          {hasUnread && (
            <span
              className="inline-flex shrink-0 items-center justify-center bg-wm-accent font-mono font-bold"
              style={{
                padding: '1px 6px',
                fontSize: 9,
                color: '#000000',
                borderRadius: 999,
              }}
            >
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </span>
      </span>
    </Link>
  )
}
