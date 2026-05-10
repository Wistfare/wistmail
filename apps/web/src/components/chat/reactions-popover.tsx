'use client'

import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

/// V3 reaction picker — Pencil reference: ChatViewV3 reactions
/// (`mCFcx`).  A short, fixed strip of emoji renders as a floating
/// pill anchored to the bubble.  Clicking an emoji fires `onPick`,
/// which the parent wires to `useToggleReaction` so the same click
/// adds OR removes the reaction (whichever the current user state
/// dictates).
///
/// The component intentionally has zero state of its own — open /
/// close lifecycle lives on the parent so the bubble can decide on
/// hover, long-press, or programmatic open without us re-implementing
/// each modality.

export const REACTION_EMOJIS = ['👍', '❤️', '😂', '🎉', '🔥'] as const

export type ReactionEmoji = (typeof REACTION_EMOJIS)[number]

export interface ReactionsPopoverProps {
  /// Emoji glyphs the current user has already reacted with.  These
  /// chips render in the lime / accent palette so the user sees their
  /// own reaction state at a glance.
  myReactions?: string[]
  /// Direction of the alignment caret.  `right` aligns to the right
  /// edge of the anchor (own outgoing bubbles); `left` aligns to the
  /// left edge (incoming bubbles).
  align?: 'left' | 'right'
  /// Click handler.  Receives the picked emoji glyph.  Caller is
  /// responsible for calling `onClose` afterward if appropriate.
  onPick: (emoji: ReactionEmoji) => void
  onClose: () => void
  className?: string
}

export function ReactionsPopover({
  myReactions,
  align = 'left',
  onPick,
  onClose,
  className,
}: ReactionsPopoverProps) {
  const ref = useRef<HTMLDivElement | null>(null)

  // Click-outside + escape close.  Mirrors how the bubble menu in
  // chat-thread-view.tsx handles dismissal so the UX is consistent.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!ref.current) return
      if (e.target instanceof Node && ref.current.contains(e.target)) return
      onClose()
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onEsc)
    }
  }, [onClose])

  const mine = new Set(myReactions ?? [])

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Pick a reaction"
      className={cn('absolute z-50', className)}
      style={{
        // Pencil's popover sits just above the bubble row, with the
        // anchor edge aligned to the message side.  We render directly
        // above the bubble so the row's hover state stays.
        bottom: 'calc(100% + 4px)',
        ...(align === 'right' ? { right: 0 } : { left: 0 }),
        background: '#111111',
        border: '1px solid #1A1A1A',
        borderRadius: 999,
        padding: '4px 6px',
        boxShadow: '0 6px 24px rgba(0, 0, 0, 0.4)',
      }}
    >
      <div className="flex items-center" style={{ gap: 2 }}>
        {REACTION_EMOJIS.map((emoji) => {
          const reacted = mine.has(emoji)
          return (
            <button
              key={emoji}
              type="button"
              onClick={() => onPick(emoji)}
              aria-label={`React with ${emoji}`}
              aria-pressed={reacted}
              title={emoji}
              className={cn(
                'flex shrink-0 cursor-pointer items-center justify-center transition-transform hover:scale-110',
                reacted && 'bg-wm-accent-dim',
              )}
              style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                fontSize: 16,
                lineHeight: '16px',
              }}
            >
              <span aria-hidden>{emoji}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

interface ReactionChipProps {
  emoji: string
  count: number
  reactedByMe?: boolean
  onClick?: () => void
}

/// Small chip rendered under a bubble for each non-empty reaction.
/// Lives next to ReactionsPopover so a chat row only has to import
/// from one file.  Mirrors the chip-styling in `MessageBubble` but is
/// exported so the inline `chat-thread-view.tsx` bubble (which
/// pre-dates the V3 primitive) can reuse it.
export function ReactionChip({
  emoji,
  count,
  reactedByMe,
  onClick,
}: ReactionChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex cursor-pointer items-center font-mono transition-colors',
        reactedByMe ? 'text-wm-accent' : 'text-wm-text-secondary',
      )}
      style={{
        gap: 4,
        padding: '3px 8px',
        fontSize: 11,
        borderRadius: 12,
        background: reactedByMe ? 'var(--color-wm-accent-dim)' : '#111111',
        border: reactedByMe
          ? '1px solid var(--color-wm-accent)'
          : '1px solid #1A1A1A',
      }}
      aria-label={`${emoji} ${count} reaction${count === 1 ? '' : 's'}`}
      aria-pressed={reactedByMe}
    >
      <span aria-hidden>{emoji}</span>
      <span style={{ fontWeight: 700 }}>{count}</span>
    </button>
  )
}
