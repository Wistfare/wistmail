'use client'

/// TanStack Query hook for the unified inbox feed (`/api/v1/inbox/list`).
/// Returns mail + chat rows merged into one chronologically-ordered
/// stream. Mirrors the server-side discriminated union exactly so the
/// inbox page renders straight from the cache without a per-row
/// transform.

import { useInfiniteQuery } from '@tanstack/react-query'
import { api } from './api-client'
import type { EmailLabelRef, EmailStatus } from './email-queries'

export type FeedKind = 'all' | 'mail' | 'chats'

export interface FeedChatParticipant {
  id: string
  name: string
  email: string
  avatarUrl: string | null
}

/// One row in the feed. `kind` is the discriminator — server keeps
/// the chip in `tag` so the row renderer (EmailRowV3) can stay
/// shape-agnostic.
export type FeedItem =
  | {
      kind: 'email'
      id: string
      tag: 'MAIL'
      activityAt: string
      isRead: boolean
      isStarred: boolean
      displayName: string
      fromAddress: string
      toAddresses: string[]
      cc: string[]
      subject: string
      snippet: string
      folder: string
      isDraft: boolean
      hasAttachments: boolean
      sizeBytes: number
      status: EmailStatus
      sendError: string | null
      mailboxId: string
      labels: EmailLabelRef[]
      threadId: string | null
    }
  | {
      kind: 'chat-direct'
      id: string
      tag: 'CHAT'
      activityAt: string
      isRead: boolean
      unreadCount: number
      displayName: string
      otherParticipants: FeedChatParticipant[]
      snippet: string
      lastMessageAt: string
    }
  | {
      kind: 'chat-group'
      id: string
      tag: 'CHANNEL'
      activityAt: string
      isRead: boolean
      unreadCount: number
      title: string | null
      otherParticipants: FeedChatParticipant[]
      snippet: string
      lastMessageAt: string
    }

export interface FeedPage {
  data: FeedItem[]
  nextCursor: string | null
  unreadCount: number
}

const PAGE_SIZE = 50

export const feedKeys = {
  all: ['inbox', 'feed'] as const,
  list: (folder: string, kind: FeedKind, q: string) =>
    ['inbox', 'feed', folder, kind, q] as const,
}

/// Infinite-query hook backing the unified inbox.  `kind=all` is the
/// default; switching to `mail` / `chats` is what the segmented
/// control wires up. `q` is the live search query — empty string
/// (the default) skips MeiliSearch on the server and runs a normal
/// chronological listing.
export function useFeedList(params: {
  folder: string
  kind: FeedKind
  q?: string
}) {
  const folder = params.folder
  const kind = params.kind
  const q = params.q?.trim() ?? ''

  return useInfiniteQuery({
    queryKey: feedKeys.list(folder, kind, q),
    queryFn: ({ pageParam }) => {
      const search = new URLSearchParams()
      search.set('folder', folder)
      search.set('kind', kind)
      search.set('limit', String(PAGE_SIZE))
      if (q) search.set('q', q)
      if (pageParam) search.set('cursor', pageParam as string)
      return api.get<FeedPage>(`/api/v1/inbox/list?${search.toString()}`)
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  })
}

// ---------------------------------------------------------------------
// Section grouping
// ---------------------------------------------------------------------

export interface FeedSection {
  /// Display label — "Today" / "Yesterday" / "This week" / "Earlier".
  label: string
  items: FeedItem[]
}

/**
 * Group feed items into the V3 inbox bands. Mirrors
 * `groupEmailsBySection` but reads `activityAt` instead of `createdAt`
 * so it works on the discriminated union.
 *
 * Pencil reference: `InboxV3.sec1` / `sec2` (`TB36x`).
 */
export function groupFeedBySection(
  items: FeedItem[],
  now: Date = new Date(),
): FeedSection[] {
  const startOfDay = new Date(now)
  startOfDay.setHours(0, 0, 0, 0)
  const startOfYesterday = new Date(startOfDay)
  startOfYesterday.setDate(startOfYesterday.getDate() - 1)
  const startOfWeekAgo = new Date(startOfDay)
  startOfWeekAgo.setDate(startOfWeekAgo.getDate() - 7)

  const today: FeedItem[] = []
  const yesterday: FeedItem[] = []
  const week: FeedItem[] = []
  const earlier: FeedItem[] = []

  for (const it of items) {
    const d = new Date(it.activityAt)
    if (d >= startOfDay) today.push(it)
    else if (d >= startOfYesterday) yesterday.push(it)
    else if (d >= startOfWeekAgo) week.push(it)
    else earlier.push(it)
  }

  const out: FeedSection[] = []
  if (today.length) out.push({ label: 'Today', items: today })
  if (yesterday.length) out.push({ label: 'Yesterday', items: yesterday })
  if (week.length) out.push({ label: 'This week', items: week })
  if (earlier.length) out.push({ label: 'Earlier', items: earlier })
  return out
}

// ---------------------------------------------------------------------
// Type narrowing helpers
// ---------------------------------------------------------------------

export function isEmail(item: FeedItem): item is Extract<FeedItem, { kind: 'email' }> {
  return item.kind === 'email'
}

export function isChat(
  item: FeedItem,
): item is Extract<FeedItem, { kind: 'chat-direct' | 'chat-group' }> {
  return item.kind === 'chat-direct' || item.kind === 'chat-group'
}

export function feedItemDisplayName(item: FeedItem): string {
  if (item.kind === 'email' || item.kind === 'chat-direct') return item.displayName
  // chat-group — fall back to a comma-joined participant list when no title.
  if (item.title && item.title.length > 0) return item.title
  const names = item.otherParticipants.slice(0, 3).map((p) => p.name)
  if (item.otherParticipants.length > 3) names.push(`+${item.otherParticipants.length - 3}`)
  return names.join(', ') || 'Group'
}
