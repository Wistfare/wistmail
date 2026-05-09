'use client'

import {
  MailOpen,
  PencilLine,
  MessageSquarePlus,
  UsersRound,
  Search,
} from 'lucide-react'

export interface ReadingEmptyProps {
  /** Unread count surfaced in the subtitle ("you've got N unread waiting"). */
  unreadCount: number
  onCompose: () => void
  onNewChat: () => void
  onNewGroup: () => void
  onSearch: () => void
}

/**
 * Reading-pane empty state — Pencil reference: `Screen/InboxV3-Empty.Reading`
 * (`s0oojK`).
 *
 *   container: bg #000000, padding 48, gap 24, vertical, alignItems
 *     center, justifyContent center, fills the 650-wide reading column.
 *
 *   eRdIco (`K0Rsq8`): 96×96 round-square (radius 24), bg #111111,
 *     1px #1A1A1A border, centered mail-open icon 42×42 #6e6e6e.
 *
 *   eRdC (`Yt4Hh`, vertical, gap 10, alignItems center, fills width):
 *     "NOTHING SELECTED" 10/700 lime tracking 2
 *     "Pick an email to read." 24/700 white tracking 0.5
 *     "Choose a thread on the left, or stay focused — you've got N
 *      unread waiting." 12/500 #999999 lh 1.6, centered, fixed width
 *
 *   eRdHints (`RTO4B`, vertical, gap 10, padding [12, 0, 0, 0],
 *     width 380):
 *     "QUICK ACTIONS" header 9/700 #6e6e6e tracking 1.5 (centered)
 *     4 row cards (radius 12, bg #111111, 1px #1A1A1A border, padding
 *       [12, 16], justify space-between):
 *       • Compose new message  · pencil-line lime 14   · kbd "C"
 *       • Start new chat       · message-square-plus  · kbd "N"
 *       • Start group chat     · users-round          · kbd "⇧N"
 *       • Search across mail and chat · search        · kbd "/"
 *     kbd chip: radius 5, bg #000000, 1px #1A1A1A border, padding
 *       [3,7], glyph 9/700 #999999.
 */
export function ReadingEmpty({
  unreadCount,
  onCompose,
  onNewChat,
  onNewGroup,
  onSearch,
}: ReadingEmptyProps) {
  const unreadLine =
    unreadCount > 0
      ? `Choose a thread on the left, or stay focused — you've got ${unreadCount} unread waiting.`
      : 'Choose a thread on the left, or stay focused — your inbox is clear.'

  return (
    <div
      className="flex h-full flex-col items-center justify-center"
      style={{ background: '#000000', padding: 48, gap: 24 }}
    >
      {/* eRdIco — 96×96 dark tile with mail-open icon. */}
      <div
        className="flex shrink-0 items-center justify-center"
        style={{
          width: 96,
          height: 96,
          borderRadius: 24,
          background: '#111111',
          border: '1px solid var(--color-wm-border)',
        }}
      >
        <MailOpen
          aria-hidden
          style={{ width: 42, height: 42, color: '#6e6e6e' }}
        />
      </div>

      {/* eRdC — eyebrow + title + subtitle. */}
      <div
        className="flex w-full flex-col items-center text-center"
        style={{ gap: 10 }}
      >
        <p
          className="font-mono font-bold uppercase text-wm-accent"
          style={{ fontSize: 10, letterSpacing: 2 }}
        >
          Nothing selected
        </p>
        <h2
          className="font-mono font-bold text-wm-text-primary"
          style={{ fontSize: 24, letterSpacing: 0.5 }}
        >
          Pick an email to read.
        </h2>
        <p
          className="font-mono font-medium text-center"
          style={{
            fontSize: 12,
            lineHeight: 1.6,
            color: '#999999',
            maxWidth: 380,
          }}
        >
          {unreadLine}
        </p>
      </div>

      {/* eRdHints — quick-actions stack, width 380. */}
      <div
        className="flex flex-col"
        style={{ width: 380, gap: 10, paddingTop: 12 }}
      >
        <p
          className="text-center font-mono font-bold uppercase"
          style={{
            fontSize: 9,
            letterSpacing: 1.5,
            color: '#6e6e6e',
          }}
        >
          Quick actions
        </p>
        <HintRow
          icon={<PencilLine style={{ width: 14, height: 14, color: 'var(--color-wm-accent)' }} />}
          label="Compose new message"
          kbd="C"
          onClick={onCompose}
        />
        <HintRow
          icon={
            <MessageSquarePlus
              style={{ width: 14, height: 14, color: 'var(--color-wm-accent)' }}
            />
          }
          label="Start new chat"
          kbd="N"
          onClick={onNewChat}
        />
        <HintRow
          icon={
            <UsersRound
              style={{ width: 14, height: 14, color: 'var(--color-wm-accent)' }}
            />
          }
          label="Start group chat"
          kbd="⇧N"
          onClick={onNewGroup}
        />
        <HintRow
          icon={<Search style={{ width: 14, height: 14, color: 'var(--color-wm-accent)' }} />}
          label="Search across mail and chat"
          kbd="/"
          onClick={onSearch}
        />
      </div>
    </div>
  )
}

/**
 * One Pencil hint row (`eRdH1` etc): radius 12, bg #111111, 1px #1A1A1A
 * border, padding [12, 16], justify space-between, alignItems center.
 *   left  → 14-px lime icon + label 12/500 white (gap 12)
 *   right → kbd chip
 */
function HintRow({
  icon,
  label,
  kbd,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  kbd: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full cursor-pointer items-center justify-between transition-colors hover:bg-wm-surface-hover"
      style={{
        padding: '12px 16px',
        borderRadius: 12,
        background: '#111111',
        border: '1px solid var(--color-wm-border)',
      }}
    >
      <span className="flex items-center" style={{ gap: 12 }}>
        {icon}
        <span
          className="font-mono font-medium text-wm-text-primary"
          style={{ fontSize: 12 }}
        >
          {label}
        </span>
      </span>
      <span
        aria-hidden
        className="flex items-center justify-center font-mono font-bold"
        style={{
          padding: '3px 7px',
          borderRadius: 5,
          fontSize: 9,
          background: '#000000',
          color: '#999999',
          border: '1px solid var(--color-wm-border)',
        }}
      >
        {kbd}
      </span>
    </button>
  )
}
