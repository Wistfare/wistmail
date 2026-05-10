'use client'

import { useMemo } from 'react'
import dynamic from 'next/dynamic'
import { Forward, Reply, ReplyAll } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { AttachmentsStrip } from './attachments-strip'
import {
  useEmailThread,
  type FullEmail,
  type ThreadMessage,
} from '@/lib/email-queries'

/// `EmailBody` pulls in `isomorphic-dompurify` (~30 KB gz on its own,
/// plus its node-stream/jsdom shim that webpack/turbopack lifts into a
/// shared chunk). We don't need it on the inbox list view — only when
/// the user has actually opened a thread and we're rendering its
/// messages. `ssr: false` keeps the server bundle clean too; the iframe
/// renderer needs `window` anyway.
const EmailBody = dynamic(
  () => import('./email-body').then((m) => ({ default: m.EmailBody })),
  { ssr: false },
)

/// Pencil reference: `Screen/InboxV3-Thread.Reading` (`srVZO`).
///
/// The reading column for a multi-message thread.  Every message in
/// the thread renders inline:
///   - prior messages → compact `PriorMessageCard` (avatar, name,
///     time, snippet, READ chip).  Click expands by switching the
///     anchor (parent passes a fresh `selectedId`).
///   - the anchor message → fully-expanded sender row + body + any
///     attachments.  Defaults to the most recent message; the user
///     can pivot to any other by clicking its compact card.
///
/// One-message threads (the common case for first inbound mail or a
/// cold draft) skip the participant stack entirely and just render
/// a single sender row + body, matching `BEYcq` (the singleton
/// variant of the same screen).

export interface ThreadReaderProps {
  /// Full email payload for whichever message is currently expanded.
  anchor: FullEmail
  /// Switches the expanded message — fires when the user clicks a
  /// compact prior-message card.  Caller updates `selectedId` to
  /// trigger a fresh `useEmailDetail` fetch.
  onPickMessage: (id: string) => void
  /// Reply / Reply-All / Forward callbacks fire from the action stack
  /// next to the participant row.  Same handlers the inbox already
  /// owns; we just hoist the rendering up here.
  onReply: () => void
  onReplyAll: () => void
  onForward: () => void
}

export function ThreadReader({
  anchor,
  onPickMessage,
  onReply,
  onReplyAll,
  onForward,
}: ThreadReaderProps) {
  const threadQ = useEmailThread(anchor.id)
  const messages: ThreadMessage[] = threadQ.data?.messages ?? []
  const sorted = useMemo(
    () =>
      [...messages].sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      ),
    [messages],
  )

  // Pencil ships two layouts for the reading pane:
  //   - InboxV3-Thread          (Z9fGe) — group: 3+ unique senders
  //   - InboxV3-Thread-OneToOne (BEYcq) — 1:1 between two parties
  // The 1:1 variant skips the avatar stack and just shows a single
  // sender row above the messages.  We pick by counting unique
  // sender addresses across the thread (case-insensitive) so a 1:1
  // with many back-and-forth messages still uses the lighter
  // chrome.  Singleton threads (one inbound or one cold draft)
  // collapse further: no header at all above the body.
  const uniqueSenders = useMemo(() => {
    const set = new Set<string>()
    for (const m of sorted) {
      set.add(extractAddress(m.fromAddress).toLowerCase())
    }
    return set
  }, [sorted])
  const isSingleton = sorted.length <= 1
  const isOneToOne = !isSingleton && uniqueSenders.size <= 2

  // Find the anchor's slot in the chronological list so prior /
  // following messages render in the right place.  Until the thread
  // query resolves (or for orphan singletons) we fall back to
  // index 0 + the anchor as the only message.
  const anchorIdx = Math.max(
    0,
    sorted.findIndex((m) => m.id === anchor.id),
  )
  const before = sorted.slice(0, anchorIdx)
  const after = sorted.slice(anchorIdx + 1)

  return (
    <div className="flex flex-col" style={{ gap: 16, padding: '0 28px' }}>
      {isOneToOne && (
        <OneToOneHeader
          anchor={anchor}
          onReply={onReply}
          onReplyAll={onReplyAll}
          onForward={onForward}
        />
      )}
      {!isOneToOne && !isSingleton && (
        <ParticipantsRow
          messages={sorted}
          onReply={onReply}
          onReplyAll={onReplyAll}
          onForward={onForward}
        />
      )}

      {before.map((m) => (
        <PriorMessageCard
          key={m.id}
          message={m}
          onClick={() => onPickMessage(m.id)}
        />
      ))}

      <ExpandedMessage
        email={anchor}
        showSenderRow={!isOneToOne}
        showActions={isSingleton}
        onReply={onReply}
        onReplyAll={onReplyAll}
        onForward={onForward}
      />

      {after.map((m) => (
        <PriorMessageCard
          key={m.id}
          message={m}
          onClick={() => onPickMessage(m.id)}
        />
      ))}
    </div>
  )
}

/// Pencil `Screen/InboxV3-Thread-OneToOne` (`BEYcq`) header — the
/// thread is between two parties, so we collapse the avatar stack to
/// a single sender row.  Identical typography to the senderRow
/// `Ogz6Z` in the legacy single-email pane, just without the
/// duplicate render inside ExpandedMessage (we suppress its sender
/// row when this header is in play, otherwise the avatar shows up
/// twice in a row).
function OneToOneHeader({
  anchor,
  onReply,
  onReplyAll,
  onForward,
}: {
  anchor: FullEmail
  onReply: () => void
  onReplyAll: () => void
  onForward: () => void
}) {
  const senderName = extractName(anchor.fromAddress)
  return (
    <div
      className="flex w-full items-center"
      style={{ gap: 12, padding: '8px 0 12px 0' }}
    >
      <Avatar name={senderName} size="lg" />
      <div className="flex min-w-0 flex-1 flex-col" style={{ gap: 2 }}>
        <p
          className="truncate font-mono font-semibold text-wm-text-primary"
          style={{ fontSize: 13 }}
        >
          {senderName}
        </p>
        <p
          className="truncate font-mono"
          style={{ fontSize: 11, color: '#6e6e6e' }}
        >
          {extractAddress(anchor.fromAddress)}
          {(anchor.toAddresses ?? []).length > 0 && (
            <>
              {' '}
              → {(anchor.toAddresses ?? []).map(extractAddress).join(', ')}
            </>
          )}
        </p>
      </div>
      <span
        className="shrink-0 font-mono"
        style={{ fontSize: 11, color: '#6e6e6e' }}
      >
        {formatRelative(anchor.createdAt)}
      </span>
      <div className="flex items-center" style={{ gap: 8 }}>
        <button
          type="button"
          onClick={onReply}
          className="inline-flex cursor-pointer items-center bg-wm-accent transition-colors hover:bg-wm-accent-hover"
          style={{
            gap: 6,
            padding: '8px 14px',
            borderRadius: 18,
            color: '#000000',
          }}
          aria-label="Reply"
        >
          <Reply style={{ width: 13, height: 13 }} />
          <span
            className="font-mono font-bold uppercase"
            style={{ fontSize: 11, letterSpacing: 1 }}
          >
            Reply
          </span>
        </button>
        <button
          type="button"
          onClick={onReplyAll}
          className="flex cursor-pointer items-center justify-center bg-wm-surface text-wm-text-primary transition-colors hover:bg-wm-surface-hover"
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            border: '1px solid var(--color-wm-border)',
          }}
          aria-label="Reply all"
        >
          <ReplyAll style={{ width: 14, height: 14 }} />
        </button>
        <button
          type="button"
          onClick={onForward}
          className="flex cursor-pointer items-center justify-center bg-wm-surface text-wm-text-primary transition-colors hover:bg-wm-surface-hover"
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            border: '1px solid var(--color-wm-border)',
          }}
          aria-label="Forward"
        >
          <Forward style={{ width: 14, height: 14 }} />
        </button>
      </div>
    </div>
  )
}

/// Composite participant row at the top of a multi-message thread —
/// Pencil `partRow` (avatar stack + name list + REPLY/replyAll/forward).
///
///   avatarStack: up to 4 overlapping 32-px avatars (Pencil shows 4),
///                deterministic colour per sender.
///   names:       "Roman, Sarah, you & 1 other" 13/600 white
///   sub:         "Subscribed → Internal & 4 others" 11/normal #6e6e6e
///                (we substitute message count + last-active for the
///                 sub line since the shape doesn't carry channel
///                 metadata)
///   actions:     REPLY pill (lime), reply-all 36 round, forward 36
///                round
function ParticipantsRow({
  messages,
  onReply,
  onReplyAll,
  onForward,
}: {
  messages: ThreadMessage[]
  onReply: () => void
  onReplyAll: () => void
  onForward: () => void
}) {
  // Unique senders by `fromAddress`, in order of first appearance —
  // Pencil shows them ordered by who started the thread first.
  const senders = useMemo(() => {
    const seen = new Set<string>()
    const out: { address: string; name: string }[] = []
    for (const m of messages) {
      const addr = extractAddress(m.fromAddress)
      if (seen.has(addr)) continue
      seen.add(addr)
      out.push({ address: addr, name: extractName(m.fromAddress) })
    }
    return out
  }, [messages])

  const visibleAvatars = senders.slice(0, 4)
  const overflow = senders.length - visibleAvatars.length

  // "Roman, Sarah, you & 1 other"-style summary.  We never dedupe to
  // "you" (we'd need session-user context to know which sender is
  // self) — Pencil's static frame uses literal names which is the
  // right default for a cold-rendered list anyway.
  const nameList = formatNameList(senders.map((s) => s.name))
  const sub = `${messages.length} message${messages.length === 1 ? '' : 's'} · last active ${formatRelative(
    messages[messages.length - 1].createdAt,
  )}`

  return (
    <div
      className="flex w-full items-center"
      style={{ gap: 12, padding: '8px 0 12px 0' }}
    >
      {/* Avatar stack — overlapping 32-px circles, hairline ring on
          each so they stay legible on any background. */}
      <div className="flex shrink-0 items-center" style={{ marginRight: 4 }}>
        {visibleAvatars.map((s, i) => (
          <span
            key={s.address}
            style={{
              marginLeft: i === 0 ? 0 : -10,
              boxShadow: '0 0 0 2px #000000',
              borderRadius: 999,
            }}
          >
            <Avatar name={s.name} size="sm" />
          </span>
        ))}
        {overflow > 0 && (
          <span
            aria-hidden
            className="flex items-center justify-center font-mono font-bold text-wm-text-secondary"
            style={{
              marginLeft: -10,
              width: 32,
              height: 32,
              borderRadius: 16,
              background: '#1A1A1A',
              boxShadow: '0 0 0 2px #000000',
              fontSize: 10,
            }}
          >
            +{overflow}
          </span>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col" style={{ gap: 2 }}>
        <p
          className="truncate font-mono font-semibold text-wm-text-primary"
          style={{ fontSize: 13 }}
        >
          {nameList}
        </p>
        <p
          className="truncate font-mono"
          style={{ fontSize: 11, color: '#6e6e6e' }}
        >
          {sub}
        </p>
      </div>

      <div className="flex items-center" style={{ gap: 8 }}>
        <button
          type="button"
          onClick={onReply}
          className="inline-flex cursor-pointer items-center bg-wm-accent transition-colors hover:bg-wm-accent-hover"
          style={{
            gap: 6,
            padding: '8px 14px',
            borderRadius: 18,
            color: '#000000',
          }}
          aria-label="Reply"
        >
          <Reply style={{ width: 13, height: 13 }} />
          <span
            className="font-mono font-bold uppercase"
            style={{ fontSize: 11, letterSpacing: 1 }}
          >
            Reply
          </span>
        </button>
        <button
          type="button"
          onClick={onReplyAll}
          className="flex cursor-pointer items-center justify-center bg-wm-surface text-wm-text-primary transition-colors hover:bg-wm-surface-hover"
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            border: '1px solid var(--color-wm-border)',
          }}
          aria-label="Reply all"
        >
          <ReplyAll style={{ width: 14, height: 14 }} />
        </button>
        <button
          type="button"
          onClick={onForward}
          className="flex cursor-pointer items-center justify-center bg-wm-surface text-wm-text-primary transition-colors hover:bg-wm-surface-hover"
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            border: '1px solid var(--color-wm-border)',
          }}
          aria-label="Forward"
        >
          <Forward style={{ width: 14, height: 14 }} />
        </button>
      </div>
    </div>
  )
}

/// Compact card for prior thread messages — Pencil `priorMsgCard`.
///
///   container: padding [12, 14], gap 12, 1px #1A1A1A border,
///              radius 12, surface fill #111111, hover #1A1A1A.
///              Click to set as the expanded anchor.
///   avatar:    28-px round
///   name:      12/600 white
///   time:      9/normal #6e6e6e — relative ("Tue 13:54")
///   snippet:   12/normal #999999 — truncated
///   READ chip: lime border + lime text 9/700 tracking 1.5 when read
function PriorMessageCard({
  message,
  onClick,
}: {
  message: ThreadMessage
  onClick: () => void
}) {
  const senderName = extractName(message.fromAddress)
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full cursor-pointer items-center text-left transition-colors hover:bg-wm-surface-hover"
      style={{
        gap: 12,
        padding: '12px 14px',
        background: 'var(--color-wm-surface)',
        border: '1px solid var(--color-wm-border)',
        borderRadius: 12,
      }}
    >
      <Avatar name={senderName} size="sm" />
      <div className="flex min-w-0 flex-1 flex-col" style={{ gap: 2 }}>
        <div className="flex w-full items-center" style={{ gap: 8 }}>
          <span
            className="truncate font-mono font-semibold text-wm-text-primary"
            style={{ fontSize: 12 }}
          >
            {senderName}
          </span>
          {message.isRead && (
            <span
              className="font-mono font-bold uppercase"
              style={{
                padding: '1px 6px',
                fontSize: 9,
                letterSpacing: 1.5,
                color: 'var(--color-wm-accent)',
                border: '1px solid var(--color-wm-accent)',
                borderRadius: 4,
              }}
            >
              Read
            </span>
          )}
          <span style={{ flex: 1 }} />
          <span
            className="shrink-0 font-mono"
            style={{ fontSize: 9, color: '#6e6e6e' }}
          >
            {formatRelative(message.createdAt)}
          </span>
        </div>
        <p
          className="truncate font-mono"
          style={{ fontSize: 12, color: '#999999' }}
        >
          {message.snippet || '(no preview)'}
        </p>
      </div>
    </button>
  )
}

/// Fully-rendered current-anchor message — Pencil `expandedMsg`.
/// Mirrors the singleton reading-pane layout so a 1-message thread
/// reuses the same component.  When `showActions` is true the
/// REPLY pill renders next to the sender row (the multi-message
/// variant lives on the `ParticipantsRow` instead so the actions
/// don't double up).
function ExpandedMessage({
  email,
  showSenderRow,
  showActions,
  onReply,
  onReplyAll,
  onForward,
}: {
  email: FullEmail
  showSenderRow: boolean
  showActions: boolean
  onReply: () => void
  onReplyAll: () => void
  onForward: () => void
}) {
  const senderName = extractName(email.fromAddress)
  return (
    <div className="flex flex-col" style={{ gap: 14 }}>
      {showSenderRow && (
        <div className="flex w-full items-center" style={{ gap: 12 }}>
          <Avatar name={senderName} size="lg" />
          <div className="flex min-w-0 flex-1 flex-col" style={{ gap: 2 }}>
            <p
              className="truncate font-mono font-semibold text-wm-text-primary"
              style={{ fontSize: 13 }}
            >
              {senderName}
            </p>
            <p
              className="truncate font-mono"
              style={{ fontSize: 11, color: '#6e6e6e' }}
            >
              {extractAddress(email.fromAddress)}
              {(email.toAddresses ?? []).length > 0 && (
                <>
                  {' '}
                  →{' '}
                  {(email.toAddresses ?? []).map(extractAddress).join(', ')}
                </>
              )}
            </p>
          </div>
          <span
            className="shrink-0 font-mono"
            style={{ fontSize: 11, color: '#6e6e6e' }}
          >
            {formatRelative(email.createdAt)}
          </span>
          {showActions && (
            <div className="flex items-center" style={{ gap: 8 }}>
              <button
                type="button"
                onClick={onReply}
                className="inline-flex cursor-pointer items-center bg-wm-accent transition-colors hover:bg-wm-accent-hover"
                style={{
                  gap: 6,
                  padding: '8px 14px',
                  borderRadius: 18,
                  color: '#000000',
                }}
                aria-label="Reply"
              >
                <Reply style={{ width: 13, height: 13 }} />
                <span
                  className="font-mono font-bold uppercase"
                  style={{ fontSize: 11, letterSpacing: 1 }}
                >
                  Reply
                </span>
              </button>
              <button
                type="button"
                onClick={onReplyAll}
                className="flex cursor-pointer items-center justify-center bg-wm-surface text-wm-text-primary transition-colors hover:bg-wm-surface-hover"
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  border: '1px solid var(--color-wm-border)',
                }}
                aria-label="Reply all"
              >
                <ReplyAll style={{ width: 14, height: 14 }} />
              </button>
              <button
                type="button"
                onClick={onForward}
                className="flex cursor-pointer items-center justify-center bg-wm-surface text-wm-text-primary transition-colors hover:bg-wm-surface-hover"
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  border: '1px solid var(--color-wm-border)',
                }}
                aria-label="Forward"
              >
                <Forward style={{ width: 14, height: 14 }} />
              </button>
            </div>
          )}
        </div>
      )}
      <AttachmentsStrip
        emailId={email.id}
        attachments={email.attachments ?? []}
      />
      <EmailBody
        htmlBody={email.htmlBody}
        textBody={email.textBody}
        attachments={email.attachments}
      />
    </div>
  )
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

function extractAddress(raw: string): string {
  const m = /<([^>]+)>/.exec(raw)
  return (m ? m[1] : raw).trim()
}

function extractName(raw: string): string {
  if (raw.includes('<')) {
    return raw.split('<')[0].trim().replace(/"/g, '') || extractAddress(raw)
  }
  const local = raw.split('@')[0]
  return local
    .split(/[._-]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

/// "Sarah, Roman & Mike" / "Sarah, Roman, Mike & 2 others"
function formatNameList(names: string[]): string {
  const firsts = names.map((n) => n.split(' ')[0]).filter(Boolean)
  if (firsts.length === 0) return ''
  if (firsts.length === 1) return firsts[0]
  if (firsts.length === 2) return `${firsts[0]} & ${firsts[1]}`
  if (firsts.length === 3) return `${firsts[0]}, ${firsts[1]} & ${firsts[2]}`
  return `${firsts.slice(0, 3).join(', ')} & ${firsts.length - 3} other${
    firsts.length - 3 === 1 ? '' : 's'
  }`
}

/// Pencil prior-msg timestamp:
///   < 60s        → "now"
///   today        → "13:54"
///   this week    → "Tue 13:54"
///   older        → "Apr 23"
function formatRelative(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const ms = now.getTime() - d.getTime()
  if (ms < 60_000) return 'now'
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  const time = d.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })
  if (sameDay) return time
  const days = Math.floor(ms / 86_400_000)
  if (days < 7) {
    const weekday = d.toLocaleDateString(undefined, { weekday: 'short' })
    return `${weekday} ${time}`
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
