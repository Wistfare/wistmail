'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Loader2, MessageSquare, Plus, Search, Users } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  useChatSearch,
  useConversations,
  type ChatSearchHit,
  type ConversationSummary,
} from '@/lib/chat-queries'
import { cn, formatRelativeTime } from '@/lib/utils'

/// Chat list landing page. Mirrors the Inbox layout — a left list
/// of conversations and a right empty pane prompting the user to
/// pick one. The conversation thread lives at /chat/[id]; this page
/// is the index.
export default function ChatIndexPage() {
  const router = useRouter()
  const list = useConversations()
  const [query, setQuery] = useState('')
  const search = useChatSearch(query)
  const inSearch = query.trim().length > 0

  return (
    <div className="flex h-full">
      <div className="flex w-[380px] shrink-0 flex-col border-r border-wm-border">
        <div className="flex items-center gap-2 border-b border-wm-border px-5 py-2.5">
          <Search className="h-4 w-4 text-wm-text-muted" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats…"
            className="flex-1 bg-transparent font-mono text-xs text-wm-text-primary placeholder:text-wm-text-muted outline-none"
          />
          {search.isFetching && inSearch && (
            <Loader2 className="h-3 w-3 animate-spin text-wm-accent" />
          )}
        </div>

        <div className="flex items-center border-b border-wm-border px-5 py-3">
          <span className="text-sm font-semibold text-wm-text-primary">
            {inSearch ? 'Search' : 'Chats'}
          </span>
          <div className="flex-1" />
          <Link
            href="/chat/new"
            className="inline-flex cursor-pointer items-center gap-1 border border-wm-border bg-wm-surface px-2 py-1 font-mono text-[10px] font-semibold text-wm-text-secondary transition-colors hover:bg-wm-surface-hover"
            title="Start a new chat"
          >
            <Plus className="h-3 w-3" />
            New
          </Link>
        </div>

        <div className="flex-1 overflow-y-auto">
          {inSearch ? (
            <SearchResults
              hits={search.data?.hits ?? []}
              loading={search.isPending}
              available={search.data?.available !== false}
              onPick={(hit) => router.push(`/chat/${hit.conversationId}`)}
            />
          ) : (
            <ConversationsList
              router={router}
              list={list}
            />
          )}
        </div>
      </div>

      {/* Empty preview pane — picking a conversation routes to /chat/[id]. */}
      <div className="flex flex-1 flex-col items-center justify-center gap-3">
        <div className="flex h-14 w-14 items-center justify-center bg-wm-accent">
          <MessageSquare className="h-6 w-6 text-wm-text-on-accent" />
        </div>
        <p className="text-base font-medium text-wm-text-primary">
          Select a chat to read
        </p>
        <p className="font-mono text-xs text-wm-text-muted">
          Or start a new conversation from the &ldquo;New&rdquo; button.
        </p>
      </div>
    </div>
  )
}

function ConversationsList({
  router,
  list,
}: {
  router: ReturnType<typeof useRouter>
  list: ReturnType<typeof useConversations>
}) {
  return (
    <>
      {list.isPending && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-wm-accent" />
        </div>
      )}

      {!list.isPending && (list.data ?? []).length === 0 && (
        <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
          <MessageSquare className="h-8 w-8 text-wm-text-muted" />
          <p className="text-sm text-wm-text-primary">No chats yet</p>
          <p className="font-mono text-[11px] text-wm-text-muted">
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

      {(list.data ?? []).map((c) => (
        <ConversationRow
          key={c.id}
          conversation={c}
          onClick={() => router.push(`/chat/${c.id}`)}
        />
      ))}
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

function ConversationRow({
  conversation,
  onClick,
}: {
  conversation: ConversationSummary
  onClick: () => void
}) {
  const other = conversation.otherParticipants[0]
  const isGroup = conversation.kind === 'group'
  const displayName =
    conversation.title ??
    other?.name ??
    other?.email ??
    'Conversation'

  return (
    <button
      onClick={onClick}
      className="group flex w-full cursor-pointer items-center gap-3 border-b border-wm-border px-5 py-3.5 text-left transition-colors hover:bg-wm-surface-hover"
    >
      {isGroup ? (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center bg-wm-accent/15">
          <Users className="h-4 w-4 text-wm-accent" />
        </div>
      ) : (
        <Avatar
          name={displayName}
          src={other?.avatarUrl}
          size="md"
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'flex-1 truncate text-[13px]',
              conversation.unreadCount > 0
                ? 'font-semibold text-wm-text-primary'
                : 'font-normal text-wm-text-secondary',
            )}
          >
            {displayName}
          </span>
          <span className="shrink-0 font-mono text-[10px] text-wm-text-muted">
            {formatRelativeTime(new Date(conversation.lastMessageAt))}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'flex-1 truncate font-mono text-[11px] leading-[1.4]',
              conversation.unreadCount > 0
                ? 'text-wm-text-primary'
                : 'text-wm-text-muted',
            )}
          >
            {conversation.lastMessage?.content ?? 'No messages yet'}
          </span>
          {conversation.unreadCount > 0 && (
            <span className="inline-flex shrink-0 items-center justify-center bg-wm-accent px-1.5 py-0.5 font-mono text-[10px] font-semibold text-wm-text-on-accent">
              {conversation.unreadCount}
            </span>
          )}
        </div>
      </div>
    </button>
  )
}
