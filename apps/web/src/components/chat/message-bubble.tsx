'use client'

import { Avatar } from '@/components/ui'
import { cn } from '@/lib/utils'

export interface MessageReaction {
  emoji: string
  count: number
  /** Did the current user react with this emoji? */
  reactedByMe?: boolean
}

export interface MessageBubbleProps {
  /** Sender display name (used for avatar + leading row label on group chats). */
  senderName: string
  senderAvatarUrl?: string | null
  /** When true, render the bubble as the current user (right-aligned, lime fill). */
  fromMe?: boolean
  /** ISO timestamp shown muted next to the bubble. */
  createdAt: string
  /** Plain-text content. HTML/Markdown rendering is up to the parent. */
  content: React.ReactNode
  reactions?: MessageReaction[]
  edited?: boolean
  /** When false (typically on grouped consecutive messages from the same
   * sender), the avatar + sender name are hidden — the bubble alone is
   * shown to mimic the design's compact stacking. */
  showHeader?: boolean
  /** Optional click handler on the bubble (e.g. open reactions popover). */
  onClick?: () => void
  className?: string
}

/**
 * V3 chat message bubble.
 *
 * Pencil reference: `ChatViewV3` message rows (`X1Safv`).
 * - From-me bubble: lime fill + black text, right-aligned, `cornerRadius`
 *   16 with the bottom-right corner squared off.
 * - From-others: surface fill + 1px border, white text, left-aligned with
 *   sender avatar.
 * - Reactions chip strip below: emoji + count, lime border + accent-dim
 *   bg when the current user reacted.
 */
export function MessageBubble({
  senderName,
  senderAvatarUrl,
  fromMe,
  createdAt,
  content,
  reactions,
  edited,
  showHeader = true,
  onClick,
  className,
}: MessageBubbleProps) {
  const time = new Date(createdAt).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })

  return (
    <div
      className={cn(
        'flex gap-2.5',
        fromMe ? 'flex-row-reverse' : 'flex-row',
        className,
      )}
    >
      {/* Avatar slot — kept (with opacity 0) when grouped so siblings line
          up on the same horizontal axis. */}
      <div className="w-8 shrink-0">
        {showHeader && !fromMe && (
          <Avatar name={senderName} src={senderAvatarUrl ?? undefined} size="sm" />
        )}
      </div>

      <div
        className={cn(
          'flex max-w-[640px] flex-col gap-1',
          fromMe ? 'items-end' : 'items-start',
        )}
      >
        {showHeader && !fromMe && (
          <span className="px-2 font-mono text-[10px] font-semibold text-wm-text-tertiary">
            {senderName}
          </span>
        )}
        <button
          type="button"
          onClick={onClick}
          className={cn(
            'group/bubble cursor-pointer rounded-2xl px-3.5 py-2 text-left font-sans text-[13px] leading-[1.5]',
            fromMe
              ? 'rounded-br-md bg-wm-accent text-wm-text-on-accent'
              : 'rounded-bl-md border border-wm-border bg-wm-surface text-wm-text-primary',
          )}
        >
          {content}
          {edited && (
            <span
              className={cn(
                'ml-2 align-middle font-mono text-[9px]',
                fromMe ? 'text-wm-text-on-accent/60' : 'text-wm-text-tertiary',
              )}
            >
              edited
            </span>
          )}
        </button>
        <span className="px-2 font-mono text-[10px] text-wm-text-tertiary">
          {time}
        </span>

        {reactions && reactions.length > 0 && (
          <div
            className={cn(
              'flex flex-wrap gap-1',
              fromMe ? 'justify-end' : 'justify-start',
            )}
          >
            {reactions.map((r) => (
              <span
                key={r.emoji}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[11px]',
                  r.reactedByMe
                    ? 'border-wm-accent bg-wm-accent-dim text-wm-accent'
                    : 'border-wm-border bg-wm-surface text-wm-text-secondary',
                )}
              >
                <span>{r.emoji}</span>
                <span className="font-bold">{r.count}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
