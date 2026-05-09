'use client'

import Link from 'next/link'
import { Hash } from 'lucide-react'
import { Avatar } from '@/components/ui'
import { cn, formatRelativeTime } from '@/lib/utils'

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
 * V3 conversation row in the left list.
 *
 * Pencil reference: `ChatViewV3` left list rows (`X1Safv`).
 * - 40-px avatar / hash badge on the left
 * - Title + preview stacked
 * - Time + unread chip stacked on the right
 * - Active = bg #1A2200 (accent-dim) with 3-px lime left stroke
 * - Hover = surface-hover
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
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group flex items-center gap-3 border-l-[3px] px-4 py-3 transition-colors',
        active
          ? 'border-l-wm-accent bg-wm-accent-dim'
          : 'border-l-transparent hover:bg-wm-surface-hover',
      )}
    >
      {kind === 'group' ? (
        <span
          aria-hidden
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-wm-accent-dim text-wm-accent"
        >
          <Hash className="h-5 w-5" />
        </span>
      ) : (
        <Avatar name={title} src={avatarUrl ?? undefined} size="md" />
      )}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-baseline gap-2">
          <span
            className={cn(
              'min-w-0 flex-1 truncate font-sans text-[13px]',
              unread && unread > 0
                ? 'font-semibold text-wm-text-primary'
                : 'text-wm-text-primary',
            )}
          >
            {title}
          </span>
          {timestamp && (
            <span className="shrink-0 font-mono text-[10px] text-wm-text-tertiary">
              {formatRelativeTime(new Date(timestamp))}
            </span>
          )}
        </span>
        {preview && (
          <span className="flex items-center gap-1.5">
            {isDraft && (
              <span className="font-mono text-[10px] font-bold uppercase tracking-[1px] text-wm-warning">
                Draft
              </span>
            )}
            <span
              className={cn(
                'truncate font-mono text-[11px]',
                unread && unread > 0 && !isDraft
                  ? 'text-wm-text-primary'
                  : isDraft
                    ? 'text-wm-text-tertiary italic'
                    : 'text-wm-text-tertiary',
              )}
            >
              {preview}
            </span>
          </span>
        )}
      </span>
      {!!unread && unread > 0 && (
        <span className="inline-flex shrink-0 items-center justify-center rounded-full bg-wm-accent px-1.5 py-px font-mono text-[10px] font-bold text-wm-text-on-accent">
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </Link>
  )
}
