'use client'

import { cn, getInitials, stringToColor } from '@/lib/utils'

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
 * V3 chat message bubble — Pencil reference: `ChatViewV3.messages`
 * (`FUGkj`) rows m1/m2/m3/m4.
 *
 *   incoming (m1, m3): row gap 10
 *     32×32 round sender avatar (deterministic colour, initials 11/700)
 *     bubble: bg #111111, radius [14,14,14,4] (bottom-LEFT squared),
 *             padding [10, 14], font-sans 13/normal lineHeight 1.5
 *   outgoing (m2, m4): row gap 10, justify end
 *     bubble: bg lime, black text, radius [14,14,4,14] (bottom-RIGHT
 *             squared), padding [10, 14]
 *   reactions strip: chip with bg #111111, 1px #1A1A1A border, radius 12,
 *     padding [3, 8], emoji + count.  Mine = lime border + accent-dim bg.
 *   meta row (`Jic2T`/`XQSuw`): time 11 #6e6e6e (+ "edited" muted).
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
  const initials = getInitials(senderName)
  const bg = stringToColor(senderName)

  return (
    <div
      className={cn('flex w-full', className)}
      style={{
        gap: 10,
        flexDirection: fromMe ? 'row-reverse' : 'row',
        justifyContent: fromMe ? 'flex-end' : 'flex-start',
      }}
    >
      {/* Avatar slot — Pencil 32×32 (m1Av), kept invisible when grouped
          to preserve column alignment. Right-side bubbles have no
          avatar in Pencil — we render an empty 0-width spacer instead. */}
      {!fromMe && (
        <div className="shrink-0" style={{ width: 32, height: 32 }}>
          {showHeader &&
            (senderAvatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={senderAvatarUrl}
                alt=""
                className="rounded-full object-cover"
                style={{ width: 32, height: 32 }}
              />
            ) : (
              <span
                aria-hidden
                className="flex items-center justify-center rounded-full font-mono font-bold text-white"
                style={{
                  width: 32,
                  height: 32,
                  fontSize: 11,
                  backgroundColor: bg,
                }}
              >
                {initials || '?'}
              </span>
            ))}
        </div>
      )}

      <div
        className="flex max-w-[640px] flex-col"
        style={{ gap: 4, alignItems: fromMe ? 'flex-end' : 'flex-start' }}
      >
        {showHeader && !fromMe && (
          <span
            className="font-mono font-semibold"
            style={{
              fontSize: 10,
              padding: '0 4px',
              color: '#6e6e6e',
            }}
          >
            {senderName}
          </span>
        )}
        <button
          type="button"
          onClick={onClick}
          className={cn(
            'cursor-pointer text-left font-sans transition-colors',
          )}
          style={{
            padding: '10px 14px',
            fontSize: 13,
            lineHeight: 1.5,
            background: fromMe ? 'var(--color-wm-accent)' : '#111111',
            color: fromMe ? '#000000' : '#FFFFFF',
            // Pencil bubble corner shapes:
            //   incoming → [14,14,14,4]   bottom-LEFT squared
            //   outgoing → [14,14,4,14]   bottom-RIGHT squared
            borderRadius: fromMe
              ? '14px 14px 4px 14px'
              : '14px 14px 14px 4px',
          }}
        >
          {content}
          {edited && (
            <span
              className="ml-2 align-middle font-mono"
              style={{
                fontSize: 9,
                color: fromMe ? 'rgba(0,0,0,0.6)' : '#6e6e6e',
              }}
            >
              edited
            </span>
          )}
        </button>

        {reactions && reactions.length > 0 && (
          <div
            className="flex flex-wrap"
            style={{
              gap: 4,
              justifyContent: fromMe ? 'flex-end' : 'flex-start',
            }}
          >
            {reactions.map((r) => (
              <span
                key={r.emoji}
                className={cn(
                  'inline-flex items-center font-mono',
                  r.reactedByMe ? 'text-wm-accent' : 'text-wm-text-secondary',
                )}
                style={{
                  gap: 4,
                  padding: '3px 8px',
                  fontSize: 11,
                  borderRadius: 12,
                  background: r.reactedByMe ? 'var(--color-wm-accent-dim)' : '#111111',
                  border: r.reactedByMe
                    ? '1px solid var(--color-wm-accent)'
                    : '1px solid #1A1A1A',
                }}
              >
                <span>{r.emoji}</span>
                <span style={{ fontWeight: 700 }}>{r.count}</span>
              </span>
            ))}
          </div>
        )}

        <span
          className="font-mono"
          style={{
            fontSize: 11,
            padding: '0 4px',
            color: '#6e6e6e',
          }}
        >
          {time}
        </span>
      </div>
    </div>
  )
}
