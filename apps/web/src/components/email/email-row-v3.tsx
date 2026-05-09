'use client'

import { Star } from 'lucide-react'
import { cn, formatRelativeTime, getInitials, stringToColor } from '@/lib/utils'
import { AttachmentBadge } from './attachments-strip'

/**
 * V3-styled inbox row.
 *
 * Pencil reference: `Screen/InboxV3` rows (`row1`–`row7`).
 * - Active: bg #1A2200, 3px lime left stroke, lime accent on metadata.
 * - Inactive read: text muted, 12px subject preview.
 * - Unread: white sender + subject, lime dot prefix.
 * - Avatar: 32×32 colored circle with initials (white) on the left.
 * - Right side: relative time (mono 10px) + star toggle.
 *
 * The row is intentionally a `<button>` so screen readers can land on it
 * via tabbing; clicks open the thread, the explicit checkbox + star
 * handlers `e.stopPropagation()` to avoid double-firing.
 */
export interface EmailRowV3Data {
  id: string
  fromAddress: string
  /** Display name preferred by the parent (handles sent/drafts → recipient). */
  displayName?: string
  subject: string
  snippet: string
  createdAt: string
  isRead: boolean
  isStarred: boolean
  hasAttachments?: boolean
  labels?: { id: string; name: string; color: string }[]
}

export interface EmailRowV3Props {
  email: EmailRowV3Data
  selected?: boolean
  /** When in selection mode, render the checkbox always-visible. */
  selectionMode?: boolean
  isChecked?: boolean
  onClick?: () => void
  onToggleStar?: () => void
  onToggleCheck?: () => void
  /** Trailing slot — used to render the SendStatusPill or other metadata. */
  trailing?: React.ReactNode
}

export function EmailRowV3({
  email,
  selected,
  selectionMode,
  isChecked,
  onClick,
  onToggleStar,
  onToggleCheck,
  trailing,
}: EmailRowV3Props) {
  const display = email.displayName ?? email.fromAddress
  const initials = getInitials(display)
  const bg = stringToColor(display)
  const time = formatRelativeTime(new Date(email.createdAt))
  const unread = !email.isRead
  return (
    <button
      type="button"
      onClick={onClick}
      data-active={selected ? 'true' : undefined}
      className={cn(
        'group flex w-full cursor-pointer items-start gap-3 border-l-[3px] px-5 py-3 text-left transition-colors',
        selected
          ? 'border-l-wm-accent bg-wm-accent-dim'
          : isChecked
            ? 'border-l-wm-accent bg-wm-accent/5'
            : 'border-l-transparent hover:bg-wm-surface-hover',
      )}
    >
      {/* Avatar / checkbox swap. The checkbox lives in the same slot as
          the avatar so toggling selection mode doesn't reflow the row. */}
      <span className="relative mt-0.5 flex h-8 w-8 shrink-0">
        <span
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-full font-sans text-[11px] font-semibold text-white transition-opacity',
            (selectionMode || isChecked) && 'opacity-0',
          )}
          style={{ backgroundColor: bg }}
          aria-hidden
        >
          {initials || '?'}
        </span>
        <span
          role="checkbox"
          aria-checked={!!isChecked}
          tabIndex={-1}
          onClick={(e) => {
            e.stopPropagation()
            onToggleCheck?.()
          }}
          className={cn(
            'absolute inset-0 flex cursor-pointer items-center justify-center text-wm-text-muted transition-opacity',
            isChecked
              ? 'opacity-100 text-wm-accent'
              : selectionMode
                ? 'opacity-100'
                : 'opacity-0 group-hover:opacity-100',
          )}
        >
          <span
            className={cn(
              'flex h-5 w-5 items-center justify-center border',
              isChecked
                ? 'border-wm-accent bg-wm-accent text-wm-text-on-accent'
                : 'border-wm-border bg-wm-surface',
            )}
          >
            {isChecked && (
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none">
                <path
                  d="M5 12l5 5 9-11"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </span>
        </span>
      </span>

      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        {/* Top row: sender + time */}
        <span className="flex items-baseline gap-2">
          {unread && (
            <span aria-hidden className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-wm-accent" />
          )}
          <span
            className={cn(
              'min-w-0 flex-1 truncate font-sans text-[13px]',
              unread ? 'font-semibold text-wm-text-primary' : 'text-wm-text-secondary',
            )}
          >
            {display}
          </span>
          <span className="shrink-0 font-mono text-[10px] text-wm-text-tertiary">{time}</span>
        </span>

        {/* Subject */}
        <span
          className={cn(
            'truncate text-[13px] leading-tight',
            unread ? 'font-medium text-wm-text-primary' : 'text-wm-text-secondary',
          )}
        >
          {email.subject || '(no subject)'}
        </span>

        {/* Preview + status */}
        <span className="flex items-center gap-2">
          <span className="line-clamp-1 flex-1 font-mono text-[11px] leading-[1.45] text-wm-text-tertiary">
            {email.snippet}
          </span>
          {email.hasAttachments && <AttachmentBadge count={1} />}
          {trailing}
        </span>

        {/* Labels chip strip */}
        {email.labels && email.labels.length > 0 && (
          <span className="flex flex-wrap gap-1 pt-0.5">
            {email.labels.map((l) => (
              <span
                key={l.id}
                className="inline-flex items-center gap-1 px-1.5 py-px font-mono text-[9px] font-semibold uppercase tracking-wide"
                style={{ backgroundColor: `${l.color}22`, color: l.color }}
              >
                <span aria-hidden className="h-1 w-1" style={{ backgroundColor: l.color }} />
                {l.name}
              </span>
            ))}
          </span>
        )}
      </span>

      {/* Star pinned to the right edge */}
      <span className="flex flex-col items-end gap-1 pt-0.5">
        <span
          role="button"
          tabIndex={-1}
          aria-label={email.isStarred ? 'Unstar' : 'Star'}
          onClick={(e) => {
            e.stopPropagation()
            onToggleStar?.()
          }}
          className={cn(
            'cursor-pointer transition-colors',
            email.isStarred ? 'text-wm-accent' : 'text-wm-text-muted hover:text-wm-text-secondary',
          )}
        >
          <Star className={cn('h-3.5 w-3.5', email.isStarred && 'fill-wm-accent')} />
        </span>
      </span>
    </button>
  )
}
