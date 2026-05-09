'use client'

import { Shimmer, ShimmerCircle, ShimmerLine } from '@/components/ui/shimmer'

/**
 * Skeleton variants for the chat surfaces.  Each component mirrors
 * the real UI's geometry so the loading state slots into the same
 * box without layout shift when data arrives.
 *
 *   ConversationListItemSkeleton  → conversation-list-item.tsx
 *   ConversationHeaderSkeleton    → chat-thread-view's header strip
 *   MessageBubbleSkeleton         → incoming / outgoing bubble pair
 *   MessageStackSkeleton          → a few alternating bubbles
 *   ChatInfoPanelSkeleton         → chat-info-panel.tsx top half
 */

/// Mirrors ConversationListItem geometry — 40-px round avatar +
/// stacked name/snippet lines + right-side timestamp.  Padding /
/// gap match the real row so swapping in real content doesn't jitter.
export function ConversationListItemSkeleton() {
  return (
    <div
      className="flex w-full items-center"
      style={{
        padding: '10px 20px',
        gap: 12,
        borderLeft: '3px solid transparent',
      }}
    >
      <ShimmerCircle size={40} />
      <span className="flex min-w-0 flex-1 flex-col" style={{ gap: 6 }}>
        <span className="flex items-center justify-between" style={{ gap: 8 }}>
          <ShimmerLine width="40%" height={12} />
          <ShimmerLine width={28} height={9} />
        </span>
        <ShimmerLine width="80%" height={11} />
      </span>
    </div>
  )
}

/// Stack of N conversation rows — used inside the ChatList while
/// `useConversations` resolves. Default 6 matches what fits in the
/// 380-wide column above the fold.
export function ConversationListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="flex w-full flex-col">
      {Array.from({ length: rows }).map((_, i) => (
        <ConversationListItemSkeleton key={i} />
      ))}
    </div>
  )
}

/// Mirrors ChatThreadView header — 40-px avatar + name/status stack
/// + 4 round 36×36 buttons. Padding [14, 24], 1px bottom hairline.
export function ConversationHeaderSkeleton() {
  return (
    <div
      className="flex w-full items-center justify-between"
      style={{
        padding: '14px 24px',
        borderBottom: '1px solid var(--color-wm-border)',
      }}
    >
      <div className="flex items-center" style={{ gap: 12 }}>
        <ShimmerCircle size={40} />
        <div className="flex flex-col" style={{ gap: 4 }}>
          <ShimmerLine width={140} height={13} />
          <ShimmerLine width={96} height={9} />
        </div>
      </div>
      <div className="flex items-center" style={{ gap: 6 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <Shimmer key={i} width={36} height={36} radius={18} />
        ))}
      </div>
    </div>
  )
}

/// One bubble skeleton — `side` flips it to mimic incoming vs
/// outgoing. Incoming has the 32-px avatar lead; outgoing right-
/// aligns and skips the avatar.
export function MessageBubbleSkeleton({
  side = 'in',
  width = 240,
  lines = 2,
}: {
  side?: 'in' | 'out'
  width?: number
  lines?: number
}) {
  const isIn = side === 'in'
  return (
    <div
      className="flex w-full"
      style={{
        gap: 10,
        flexDirection: isIn ? 'row' : 'row-reverse',
        justifyContent: isIn ? 'flex-start' : 'flex-end',
      }}
    >
      {isIn ? <ShimmerCircle size={32} /> : <span style={{ width: 32 }} />}
      <Shimmer
        width={width}
        height={lines * 18 + 12}
        radius={14}
        // The bubble corners differ on incoming vs outgoing — the
        // shimmer is symmetric so we don't bother with the squared
        // corner; close enough for a placeholder.
      />
    </div>
  )
}

/// A short alternating run of bubbles with a "TODAY · HH:MM" day
/// separator at the top — mirrors the real `messages` stack so the
/// loader fills the same vertical slot.
export function MessageStackSkeleton() {
  return (
    <div
      className="flex w-full flex-col"
      style={{ gap: 14, padding: '20px 28px 12px 28px' }}
    >
      <DaySeparatorSkeleton />
      <MessageBubbleSkeleton side="in" width={260} lines={1} />
      <MessageBubbleSkeleton side="out" width={200} lines={1} />
      <MessageBubbleSkeleton side="out" width={280} lines={2} />
      <MessageBubbleSkeleton side="in" width={320} lines={3} />
      <MessageBubbleSkeleton side="out" width={180} lines={1} />
    </div>
  )
}

/// "TODAY · 10:14 AM" divider with hairlines on each side. Pencil
/// `b44Hv`. The real divider is 1-px lines; we mimic with a thin
/// shimmer line on each side and a plain text-shaped block in the
/// middle.
export function DaySeparatorSkeleton() {
  return (
    <div
      className="flex items-center justify-center"
      style={{ gap: 12 }}
    >
      <ShimmerLine width="100%" height={1} />
      <ShimmerLine width={120} height={9} />
      <ShimmerLine width="100%" height={1} />
    </div>
  )
}

/// Top half of ChatInfoPanel — 80-px avatar, name, role, ACTIVE NOW
/// pill, qaRow.  Real geometry to mirror.
export function ChatInfoPanelSkeleton() {
  return (
    <aside
      className="flex w-[358px] shrink-0 flex-col overflow-hidden"
      style={{
        background: '#000000',
        borderLeft: '1px solid var(--color-wm-border)',
      }}
    >
      <div
        className="flex flex-col items-center"
        style={{ gap: 10, padding: '28px 20px 20px 20px' }}
      >
        <ShimmerCircle size={80} />
        <ShimmerLine width={140} height={16} />
        <ShimmerLine width={108} height={11} />
        <Shimmer width={108} height={22} radius={14} />
      </div>
      <div
        className="flex w-full"
        style={{ gap: 8, padding: '0 20px 20px 20px' }}
      >
        {Array.from({ length: 4 }).map((_, i) => (
          <Shimmer
            key={i}
            width="100%"
            height={56}
            radius={12}
            className="flex-1"
          />
        ))}
      </div>
      <span
        aria-hidden
        style={{ height: 1, background: 'var(--color-wm-border)' }}
      />
      <div
        className="flex flex-col"
        style={{ gap: 10, padding: '16px 20px' }}
      >
        <ShimmerLine width={88} height={9} />
        <Shimmer width="100%" height={56} radius={10} />
      </div>
    </aside>
  )
}

/// The composer placeholder while the conversation hydrates — keeps
/// the input strip slot the same height so the messages area doesn't
/// jump.
export function MessageComposerSkeleton() {
  return (
    <div
      className="flex w-full flex-col"
      style={{
        padding: '12px 20px 16px 20px',
        gap: 10,
        borderTop: '1px solid var(--color-wm-border)',
      }}
    >
      <Shimmer width="100%" height={48} radius={24} />
    </div>
  )
}

/// The full conversation skeleton — header + messages + composer.
/// Used by inbox/page.tsx when the ChatThreadView is mounted but the
/// useMessages query is still pending.
export function ChatThreadSkeleton() {
  return (
    <div className="flex h-full w-full flex-col">
      <ConversationHeaderSkeleton />
      <div className="flex-1 overflow-hidden">
        <MessageStackSkeleton />
      </div>
      <MessageComposerSkeleton />
    </div>
  )
}
