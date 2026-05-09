'use client'

import { Star } from 'lucide-react'
import { cn, getInitials, stringToColor } from '@/lib/utils'
import { AttachmentBadge } from './attachments-strip'

/**
 * V3 inbox row — Pencil reference: `Screen/InboxV3` rows (`row1`–`row7`).
 *
 *   row container: padding [12, 20], gap 12 horizontal
 *     active: bg #1A2200, 3-px lime LEFT stroke
 *     hover:  bg #1A1A1A
 *     idle:   transparent
 *   avatar: 40×40 round, deterministic colour, initials 13/700 white
 *           — for channel rows the avatar is a hash icon on a purple bg,
 *             but the row component is generic so the parent supplies
 *             `tag` ('CHAT' | 'CHANNEL' | 'BYTE' …) and we derive the
 *             default styling. (Channel-specific rendering is left to
 *             the parent if needed.)
 *   col (gap 3 vertical):
 *     header (justify between):
 *       hL (gap 6): name 13/600 white + tag chip
 *       time 11 #6e6e6e
 *     subject 13/600 white (only for MAIL kind, omitted for CHAT)
 *     snippet 12/normal #999999
 *
 * Tag chip palette (Pencil exact):
 *     MAIL on active → bg lime, text black (small chip "MAIL" 9/700)
 *     MAIL on others → bg #1A2A4A, text #3B82F6
 *     CHAT           → bg #1A2A4A, text #3B82F6
 *     CHANNEL        → bg #2A1A4A, text #A07AFF
 *     BYTE           → bg #2A1A1A, text #FFA07A
 */
export type EmailRowV3Tag = 'MAIL' | 'CHAT' | 'CHANNEL' | 'BYTE'

export interface EmailRowV3Data {
  id: string
  fromAddress: string
  /** Display name preferred by the parent (handles sent/drafts → recipient). */
  displayName?: string
  subject: string
  snippet: string
  /** Pre-formatted relative time (e.g. "2:34 PM" / "4m" / "1d") — the
   * parent computes this since the format depends on whether the row
   * is in Today vs. earlier sections. */
  timeLabel: string
  isRead: boolean
  isStarred: boolean
  hasAttachments?: boolean
  tag?: EmailRowV3Tag
  labels?: { id: string; name: string; color: string }[]
}

export interface EmailRowV3Props {
  email: EmailRowV3Data
  selected?: boolean
  onClick?: () => void
  onToggleStar?: () => void
  /** Trailing slot — used to render the SendStatusPill or other metadata. */
  trailing?: React.ReactNode
}

export function EmailRowV3({
  email,
  selected,
  onClick,
  onToggleStar,
  trailing,
}: EmailRowV3Props) {
  const display = email.displayName ?? email.fromAddress
  const initials = getInitials(display)
  const bg = stringToColor(display)
  const tag = email.tag ?? 'MAIL'
  const isMail = tag === 'MAIL'

  return (
    <button
      type="button"
      onClick={onClick}
      data-active={selected ? 'true' : undefined}
      className={cn(
        'flex w-full cursor-pointer items-start text-left transition-colors',
        selected ? 'bg-wm-accent-dim' : 'hover:bg-wm-surface-hover',
      )}
      style={{
        padding: '12px 20px',
        gap: 12,
        // Pencil row1 has a 3-px LEFT lime stroke on the active row only.
        borderLeft: selected
          ? '3px solid var(--color-wm-accent)'
          : '3px solid transparent',
      }}
    >
      {/* Avatar — Pencil V3 doesn't ship row-level multi-select, so we
          render the 40×40 deterministic-colour avatar with no hover
          swap to a checkbox. The selection-related props on this
          component (selectionMode, isChecked, onToggleCheck) are kept
          for forward-compat but currently no-op visually. */}
      <span
        aria-hidden
        className="flex shrink-0 items-center justify-center rounded-full font-mono font-bold text-white"
        style={{ width: 40, height: 40, fontSize: 13, backgroundColor: bg }}
      >
        {initials || '?'}
      </span>

      <span
        className="flex min-w-0 flex-1 flex-col"
        style={{ gap: 3 }}
      >
        {/* header: name + tag + time */}
        <span className="flex w-full items-center justify-between" style={{ gap: 8 }}>
          <span className="flex min-w-0 items-center" style={{ gap: 6 }}>
            <span
              className="min-w-0 truncate font-mono font-semibold text-wm-text-primary"
              style={{ fontSize: 13 }}
            >
              {display}
            </span>
            <TagChip tag={tag} active={selected} />
          </span>
          <span
            className="shrink-0 font-mono"
            style={{ fontSize: 11, color: '#6e6e6e' }}
          >
            {email.timeLabel}
          </span>
        </span>

        {/* subject — only mail rows show a separate subject line; chat
            rows go straight to snippet (Pencil row2/row4/row6 omit subj) */}
        {isMail && email.subject && (
          <span
            className="truncate font-mono font-semibold text-wm-text-primary"
            style={{ fontSize: 13 }}
          >
            {email.subject}
          </span>
        )}

        {/* snippet */}
        <span className="flex items-center" style={{ gap: 8 }}>
          <span
            className="line-clamp-1 flex-1 font-mono"
            style={{ fontSize: 12, color: '#999999' }}
          >
            {email.snippet}
          </span>
          {email.hasAttachments && <AttachmentBadge count={1} />}
          {trailing}
        </span>

        {/* labels chip strip */}
        {email.labels && email.labels.length > 0 && (
          <span className="flex flex-wrap" style={{ gap: 4, paddingTop: 2 }}>
            {email.labels.map((l) => (
              <span
                key={l.id}
                className="inline-flex items-center font-mono font-bold uppercase"
                style={{
                  gap: 4,
                  padding: '1px 5px',
                  fontSize: 9,
                  letterSpacing: 0.5,
                  background: `${l.color}33`,
                  color: l.color,
                  borderRadius: 4,
                }}
              >
                <span
                  aria-hidden
                  style={{ width: 4, height: 4, background: l.color }}
                />
                {l.name}
              </span>
            ))}
          </span>
        )}
      </span>

      {/* star — pinned to right edge */}
      <span
        role="button"
        tabIndex={-1}
        aria-label={email.isStarred ? 'Unstar' : 'Star'}
        onClick={(e) => {
          e.stopPropagation()
          onToggleStar?.()
        }}
        className={cn(
          'shrink-0 cursor-pointer transition-colors',
          email.isStarred ? 'text-wm-accent' : 'text-wm-text-muted hover:text-wm-text-secondary',
        )}
        style={{ paddingTop: 2 }}
      >
        <Star
          className={cn(email.isStarred && 'fill-wm-accent')}
          style={{ width: 14, height: 14 }}
        />
      </span>
    </button>
  )
}

const TAG_PALETTE: Record<EmailRowV3Tag, { bg: string; fg: string }> = {
  MAIL: { bg: '#1A2A4A', fg: '#3B82F6' },
  CHAT: { bg: '#1A2A4A', fg: '#3B82F6' },
  CHANNEL: { bg: '#2A1A4A', fg: '#A07AFF' },
  BYTE: { bg: '#2A1A1A', fg: '#FFA07A' },
}

function TagChip({
  tag,
  active,
}: {
  tag: EmailRowV3Tag
  active?: boolean
}) {
  const palette = TAG_PALETTE[tag]
  // Pencil row1 (active) gets the "MAIL" chip in lime fill + black text;
  // every other row uses the muted palette.
  const styles =
    active && tag === 'MAIL'
      ? { background: 'var(--color-wm-accent)', color: '#000000' }
      : { background: palette.bg, color: palette.fg }
  return (
    <span
      className="inline-flex items-center font-mono font-bold uppercase"
      style={{
        ...styles,
        padding: '1px 5px',
        fontSize: 9,
        letterSpacing: 0.5,
        borderRadius: 4,
      }}
    >
      {tag}
    </span>
  )
}
