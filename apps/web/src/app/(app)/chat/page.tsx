'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ChevronDown,
  Loader2,
  MessageSquare,
  Plus,
  Search,
  User,
  Users,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConversationListItem } from '@/components/chat'
import {
  useChatSearch,
  useConversations,
  type ChatSearchHit,
} from '@/lib/chat-queries'
import { cn, formatRelativeTime } from '@/lib/utils'

type ContentType = 'all' | 'direct' | 'group'

/// Chat index — Pencil reference: `Screen/ChatViewV3.ChatList` (`tUrQl`).
///
/// Header (padding [24,20,16,20], gap 6 vertical):
///   "Chats" 32/700 + "+ NEW ▾" lime pill
///   "4 UNREAD · 1 MENTION" 10/500 #999999 tracking 1.5
///
/// Segment row (padding [0,20,16,20], gap 8):
///   ALL · count · MAIL · CHATS pills + 34×34 round search button.
///
/// The conversation list is grouped into TODAY / YESTERDAY / EARLIER
/// sections (the 4-pane layout itself only renders the left column on
/// /chat — selecting a conversation routes to /chat/[id]).
export default function ChatIndexPage() {
  const router = useRouter()
  const list = useConversations()
  const [query, setQuery] = useState('')
  const search = useChatSearch(query)
  const inSearch = query.trim().length > 0
  const [contentType, setContentType] = useState<ContentType>('all')

  const conversations = list.data ?? []
  const filtered = conversations.filter((c) => {
    if (contentType === 'direct' && c.kind !== 'direct') return false
    if (contentType === 'group' && c.kind !== 'group') return false
    return true
  })
  const unreadCount = conversations.reduce(
    (sum, c) => sum + (c.unreadCount ?? 0),
    0,
  )

  return (
    <div className="flex h-full">
      {/* ChatList (`tUrQl`): 380, fill #000000, 1px right hairline. */}
      <div
        className="flex w-[380px] shrink-0 flex-col"
        style={{
          background: '#000000',
          borderRight: '1px solid var(--color-wm-border)',
        }}
      >
        {/* lH header */}
        <header
          className="flex w-full flex-col"
          style={{ gap: 6, padding: '24px 20px 16px 20px' }}
        >
          <div className="flex w-full items-center justify-between">
            <h1
              className="font-mono font-bold text-wm-text-primary"
              style={{ fontSize: 32 }}
            >
              Chats
            </h1>
            <Link
              href="/chat/new"
              className="inline-flex cursor-pointer items-center bg-wm-accent transition-colors hover:bg-wm-accent-hover"
              style={{
                gap: 7,
                padding: '8px 14px',
                borderRadius: 19,
                boxShadow: '0 4px 16px 0 rgba(191,255,0,0.25)',
                color: '#000000',
              }}
              aria-label="Start a new chat"
            >
              <Plus style={{ width: 14, height: 14 }} />
              <span
                className="font-mono font-bold uppercase"
                style={{ fontSize: 11, letterSpacing: 1 }}
              >
                New
              </span>
              <ChevronDown style={{ width: 11, height: 11 }} />
            </Link>
          </div>
          <p
            className="font-mono uppercase"
            style={{
              fontSize: 10,
              fontWeight: 500,
              letterSpacing: 1.5,
              color: '#999999',
            }}
          >
            {unreadCount} unread · 0 mentions
          </p>
        </header>

        {/* seg row — ALL · DIRECT · GROUPS + standalone search */}
        <div
          className="flex w-full items-center"
          style={{ gap: 8, padding: '0 20px 16px 20px' }}
        >
          <SegPill
            active={contentType === 'all'}
            onClick={() => setContentType('all')}
          >
            ALL
            <span
              className="font-mono font-bold"
              style={{
                fontSize: 11,
                letterSpacing: 1,
                opacity: contentType === 'all' ? 0.6 : 0.7,
              }}
            >
              {conversations.length}
            </span>
          </SegPill>
          <SegPill
            active={contentType === 'direct'}
            onClick={() => setContentType('direct')}
            icon={<User style={{ width: 11, height: 11 }} />}
          >
            DIRECT
          </SegPill>
          <SegPill
            active={contentType === 'group'}
            onClick={() => setContentType('group')}
            icon={<Users style={{ width: 11, height: 11 }} />}
          >
            GROUPS
          </SegPill>
          <span style={{ flex: 1 }} />
          <button
            type="button"
            onClick={() => {
              const v = window.prompt('Search messages')
              if (v !== null) setQuery(v)
            }}
            aria-label="Search messages"
            className="flex cursor-pointer items-center justify-center bg-wm-surface text-wm-text-secondary transition-colors hover:bg-wm-surface-hover hover:text-wm-text-primary"
            style={{
              width: 34,
              height: 34,
              borderRadius: 17,
              border: '1px solid var(--color-wm-border)',
            }}
          >
            <Search style={{ width: 14, height: 14 }} />
          </button>
        </div>

        {/* Search-result bar — only visible when an explicit query is set. */}
        {inSearch && (
          <div
            className="flex w-full items-center"
            style={{
              gap: 8,
              padding: '8px 20px',
              borderTop: '1px solid var(--color-wm-border)',
              borderBottom: '1px solid var(--color-wm-border)',
            }}
          >
            <Search style={{ width: 14, height: 14, color: '#6e6e6e' }} />
            <span
              className="flex-1 truncate font-mono text-wm-text-primary"
              style={{ fontSize: 12 }}
            >
              {query}
            </span>
            <button
              type="button"
              onClick={() => setQuery('')}
              className="cursor-pointer font-mono text-wm-text-muted hover:text-wm-text-secondary"
              style={{ fontSize: 11 }}
            >
              Clear
            </button>
            {search.isFetching && (
              <Loader2
                className="animate-spin text-wm-accent"
                style={{ width: 12, height: 12 }}
              />
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {inSearch ? (
            <SearchResults
              hits={search.data?.hits ?? []}
              loading={search.isPending}
              available={search.data?.available !== false}
              onPick={(hit) => router.push(`/chat/${hit.conversationId}`)}
            />
          ) : (
            <ConversationsList router={router} list={list} items={filtered} />
          )}
        </div>
      </div>

      {/* Empty preview pane — picking a conversation routes to /chat/[id]. */}
      <div className="flex flex-1 flex-col items-center justify-center" style={{ gap: 12 }}>
        <div
          className="flex items-center justify-center bg-wm-accent"
          style={{ width: 56, height: 56, borderRadius: 14 }}
        >
          <MessageSquare style={{ width: 24, height: 24, color: '#000000' }} />
        </div>
        <p className="font-mono font-semibold text-wm-text-primary" style={{ fontSize: 14 }}>
          Select a chat to read
        </p>
        <p className="font-mono" style={{ fontSize: 11, color: '#6e6e6e' }}>
          Or start a new conversation from the &ldquo;New&rdquo; button.
        </p>
      </div>
    </div>
  )
}

function SegPill({
  active,
  icon,
  children,
  onClick,
}: {
  active: boolean
  icon?: React.ReactNode
  children: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex cursor-pointer items-center font-mono uppercase transition-colors',
        active
          ? 'bg-wm-accent hover:bg-wm-accent-hover'
          : 'bg-wm-surface hover:bg-wm-surface-hover',
      )}
      style={{
        gap: 6,
        padding: '8px 14px',
        borderRadius: 18,
        fontSize: 11,
        fontWeight: active ? 700 : 600,
        letterSpacing: 1,
        color: active ? '#000000' : '#FFFFFF',
      }}
    >
      {icon}
      {children}
    </button>
  )
}

function ConversationsList({
  router,
  list,
  items,
}: {
  router: ReturnType<typeof useRouter>
  list: ReturnType<typeof useConversations>
  items: ReturnType<typeof useConversations>['data'] extends infer T
    ? T extends Array<infer U>
      ? U[]
      : never
    : never
}) {
  return (
    <>
      {list.isPending && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-wm-accent" />
        </div>
      )}

      {!list.isPending && items.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
          <MessageSquare className="h-8 w-8 text-wm-text-muted" />
          <p className="font-mono font-semibold text-wm-text-primary" style={{ fontSize: 13 }}>
            No chats yet
          </p>
          <p className="font-mono text-wm-text-muted" style={{ fontSize: 11 }}>
            Start a conversation with a teammate.
          </p>
          <Button
            variant="primary"
            size="sm"
            onClick={() => router.push('/chat/new')}
          >
            Start a chat
          </Button>
        </div>
      )}

      {items.map((c) => {
        const other = c.otherParticipants[0]
        const isGroup = c.kind === 'group'
        const title =
          c.title ?? other?.name ?? other?.email ?? 'Conversation'
        return (
          <ConversationListItem
            key={c.id}
            href={`/chat/${c.id}`}
            kind={isGroup ? 'group' : 'direct'}
            title={title}
            avatarUrl={other?.avatarUrl}
            preview={c.lastMessage?.content ?? 'No messages yet'}
            timestamp={c.lastMessageAt}
            unread={c.unreadCount}
          />
        )
      })}
    </>
  )
}

function SearchResults({
  hits,
  loading,
  available,
  onPick,
}: {
  hits: ChatSearchHit[]
  loading: boolean
  available: boolean
  onPick: (hit: ChatSearchHit) => void
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-wm-accent" />
      </div>
    )
  }
  if (!available) {
    return (
      <p className="px-6 py-8 text-center font-mono text-[11px] text-wm-text-muted">
        Search isn&rsquo;t configured on this server.
      </p>
    )
  }
  if (hits.length === 0) {
    return (
      <p className="px-6 py-8 text-center font-mono text-[11px] text-wm-text-muted">
        No matching messages.
      </p>
    )
  }
  return (
    <>
      {hits.map((hit) => (
        <button
          key={hit.messageId}
          onClick={() => onPick(hit)}
          className="flex w-full cursor-pointer flex-col gap-1 border-b border-wm-border px-5 py-3 text-left transition-colors hover:bg-wm-surface-hover"
        >
          <div className="flex items-center gap-2">
            <span className="truncate text-[12px] font-semibold text-wm-text-primary">
              {hit.conversationTitle ?? hit.senderName}
            </span>
            <span className="ml-auto shrink-0 font-mono text-[10px] text-wm-text-muted">
              {formatRelativeTime(new Date(hit.createdAt))}
            </span>
          </div>
          <span className="line-clamp-2 font-mono text-[11px] leading-[1.4] text-wm-text-secondary">
            <span className="text-wm-text-muted">{hit.senderName}: </span>
            {hit.content}
          </span>
        </button>
      ))}
    </>
  )
}
