'use client'

import { Hash, Mail, MessageCircle, Star, UsersRound } from 'lucide-react'
import { cn, getInitials, stringToColor } from '@/lib/utils'
import { AttachmentBadge } from './attachments-strip'

/**
 * V3 inbox row — Pencil reference: `Screen/InboxV3` rows (`row1`–`row7`).
 *
 *   row container: padding [12, 20], gap 12 horizontal
 *     active: bg #1A2200, 3-px lime LEFT stroke
 *     hover:  bg #1A1A1A
 *     idle:   transparent
 *
 *   avatar: 40×40 round
 *     mail / direct chat → deterministic colour fill, initials 13/700
 *     group              → fill #6D4AD4, hash icon 18 white
 *
 *   kindBadge (`zV8Vt` etc) — 20×20 circle pinned to the avatar's
 *     bottom-right (Pencil position x=23, y=23 inside the 40×40
 *     avatar frame). Fill #111111, 2px outside #000 stroke (so it
 *     reads as a "cut-out" against the row background).  Centered
 *     12-px lucide icon white:
 *       MAIL    → mail
 *       CHAT    → message-circle
 *       CHANNEL → users-round
 *
 *   col (gap 3 vertical):
 *     header (justify between):
 *       name 13/600 white truncate
 *       time 11 #6e6e6e
 *     subject 13/600 white (only for MAIL kind, omitted for chat rows)
 *     snippet 12/normal #999999
 *
 * The text "MAIL" / "CHAT" / "CHANNEL" chip that used to sit next to
 * the name is gone — Pencil's latest pass surfaces the kind on the
 * avatar via the badge so the name line stays clean.
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
  const isGroup = tag === 'CHANNEL'

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
      {/* Avatar + kindBadge — Pencil overlays a 20×20 badge on the
          avatar's bottom-right corner.  We position the badge with
          absolute coordinates inside a relatively positioned wrapper
          so the badge cleanly overlaps the avatar's edge. */}
      <span
        aria-hidden
        className="relative shrink-0"
        style={{ width: 40, height: 40 }}
      >
        {isGroup ? (
          <span
            className="flex items-center justify-center rounded-full text-white"
            style={{ width: 40, height: 40, background: '#6D4AD4' }}
          >
            <Hash style={{ width: 18, height: 18 }} />
          </span>
        ) : (
          <span
            className="flex items-center justify-center rounded-full font-mono font-bold text-white"
            style={{ width: 40, height: 40, fontSize: 13, backgroundColor: bg }}
          >
            {initials || '?'}
          </span>
        )}
        {/* kindBadge — Pencil position x:23 y:23 inside the avatar frame. */}
        <KindBadge tag={tag} />
      </span>

      <span
        className="flex min-w-0 flex-1 flex-col"
        style={{ gap: 3 }}
      >
        {/* header: name + time (no kind chip — surfaced on the avatar) */}
        <span className="flex w-full items-center justify-between" style={{ gap: 8 }}>
          <span
            className="min-w-0 truncate font-mono font-semibold text-wm-text-primary"
            style={{ fontSize: 13 }}
          >
            {display}
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

      {/* star — pinned to right edge.  Only meaningful on mail rows;
          chat rows don't have a star concept yet, so we hide it. */}
      {isMail && (
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
      )}
    </button>
  )
}

/**
 * Kind badge — Pencil `kindBadge` (`zV8Vt`/`UDMI1`/`A5NM6` etc).
 * 20×20 round-square pinned to the avatar's bottom-right (Pencil
 * coords x=23,y=23 inside a 40×40 frame). Fill #111111 with a 2-px
 * outside black stroke so the badge "cuts out" cleanly against the
 * row background regardless of hover/active tint.  The icon is
 * always white at 12 px.
 */
function KindBadge({ tag }: { tag: EmailRowV3Tag }) {
  let Icon = Mail
  if (tag === 'CHAT') Icon = MessageCircle
  else if (tag === 'CHANNEL') Icon = UsersRound

  return (
    <span
      aria-hidden
      className="absolute flex items-center justify-center rounded-full"
      style={{
        // Pencil position inside the 40×40 avatar.
        left: 23,
        top: 23,
        width: 20,
        height: 20,
        background: '#111111',
        boxShadow: '0 0 0 2px #000000',
      }}
    >
      <Icon style={{ width: 12, height: 12, color: '#FFFFFF' }} />
    </span>
  )
}
