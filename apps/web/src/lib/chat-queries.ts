'use client'

import {
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query'
import { api } from './api-client'
import type { FeedItem, FeedPage } from './feed-queries'

/// TanStack Query bindings for the chat module. Mirrors the shape of
/// `email-queries.ts`: a single `chatKeys` namespace + thin wrappers
/// that go through the shared `api` client so cookies + error
/// handling are uniform with the rest of the app.

export interface ConversationParticipant {
  id: string
  name: string
  email: string
  avatarUrl: string | null
}

export interface LastMessage {
  id: string
  content: string
  senderId: string
  createdAt: string
}

export interface ConversationSummary {
  id: string
  kind: 'direct' | 'group'
  title: string | null
  lastMessageAt: string
  unreadCount: number
  otherParticipants: ConversationParticipant[]
  lastMessage: LastMessage | null
}

/// Per-message reactions, keyed by emoji.  Empty / missing keys are
/// pruned server-side so the UI can iterate Object.keys without
/// filtering out zero-count chips.
export type ChatReactions = Record<string, string[]>

export interface ChatMessage {
  id: string
  conversationId: string
  senderId: string
  content: string
  createdAt: string
  editedAt?: string | null
  deletedAt?: string | null
  attachments?: ChatAttachment[]
  reactions?: ChatReactions
  /// Client-side delivery status — populated for the user's own
  /// outgoing messages so the bubble can render the sending /
  /// sent / failed indicator.  The server never sends this field;
  /// it's derived locally during optimistic send and replaced by
  /// the server payload (which is treated as `sent` by default).
  _status?: 'sending' | 'sent' | 'failed'
}

export interface ChatAttachment {
  id: string
  filename: string
  contentType: string
  sizeBytes: number
}

export interface ConversationReadEntry {
  messageId: string
  userId: string
  readAt: string
}

export interface ContactSearchResult {
  id: string
  name: string
  email: string
  avatarUrl: string | null
}

export interface ChatSearchHit {
  messageId: string
  conversationId: string
  conversationTitle: string | null
  senderId: string
  senderName: string
  content: string
  createdAt: string
}

/// Walk every cached `useFeedList` page and patch the chat row whose
/// `id` matches `conversationId` with the latest message + activityAt
/// + unread bump.  We touch every (folder, kind, q) variant of the
/// feed because the user might be looking at any of them — limiting
/// to one would silently leave the other tabs stale.
///
/// `incrementUnread` lets the caller tell us this is an incoming
/// message (bump the badge) vs a self-send (clear it / no-op since
/// the user's looking at the thread).  Re-sorts each page's data by
/// `activityAt` so the bumped row floats to the top of its page.
function bumpFeedRow(
  qc: QueryClient,
  conversationId: string,
  patch: { activityAt: string; snippet: string },
  incrementUnread: boolean,
) {
  const matches = qc.getQueriesData<InfiniteData<FeedPage>>({
    queryKey: ['inbox', 'feed'],
  })
  for (const [key, data] of matches) {
    if (!data) continue
    let touched = false
    const nextPages: FeedPage[] = data.pages.map((page) => {
      const nextData = page.data.map((it: FeedItem) => {
        if (
          (it.kind === 'chat-direct' || it.kind === 'chat-group') &&
          it.id === conversationId
        ) {
          touched = true
          return {
            ...it,
            activityAt: patch.activityAt,
            lastMessageAt: patch.activityAt,
            snippet: patch.snippet,
            isRead: incrementUnread ? false : it.isRead,
            unreadCount: incrementUnread
              ? it.unreadCount + 1
              : it.unreadCount,
          } as FeedItem
        }
        return it
      })
      // Re-sort within the page so the bumped row floats to the top.
      nextData.sort(
        (a, b) =>
          new Date(b.activityAt).getTime() - new Date(a.activityAt).getTime(),
      )
      return { ...page, data: nextData }
    })
    if (touched) {
      qc.setQueryData<InfiniteData<FeedPage>>(key, {
        ...data,
        pages: nextPages,
      })
    }
  }
}

export const chatKeys = {
  all: ['chat'] as const,
  conversations: () => ['chat', 'conversations'] as const,
  messages: (conversationId: string) =>
    ['chat', 'messages', conversationId] as const,
  participants: (conversationId: string) =>
    ['chat', 'participants', conversationId] as const,
  reads: (conversationId: string) =>
    ['chat', 'reads', conversationId] as const,
  search: (q: string) => ['chat', 'search', q] as const,
}

export function useConversations() {
  return useQuery({
    queryKey: chatKeys.conversations(),
    queryFn: async () => {
      const res = await api.get<{ conversations: ConversationSummary[] }>(
        '/api/v1/chat/conversations',
      )
      return res.conversations
    },
  })
}

export function useMessages(conversationId: string | null) {
  return useQuery({
    queryKey: conversationId
      ? chatKeys.messages(conversationId)
      : ['chat', 'messages', 'none'],
    queryFn: async () => {
      if (!conversationId) return []
      const res = await api.get<{ messages: ChatMessage[] }>(
        `/api/v1/chat/conversations/${conversationId}/messages`,
      )
      return res.messages
    },
    enabled: !!conversationId,
  })
}

export function useConversationReads(conversationId: string | null) {
  return useQuery({
    queryKey: conversationId
      ? chatKeys.reads(conversationId)
      : ['chat', 'reads', 'none'],
    queryFn: async () => {
      if (!conversationId) return []
      const res = await api.get<{ reads: ConversationReadEntry[] }>(
        `/api/v1/chat/conversations/${conversationId}/reads`,
      )
      return res.reads
    },
    enabled: !!conversationId,
  })
}

export function useEditMessage(conversationId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { messageId: string; content: string }) => {
      const res = await api.patch<{
        id: string
        content: string
        editedAt: string
      }>(
        `/api/v1/chat/conversations/${conversationId}/messages/${input.messageId}`,
        { content: input.content },
      )
      return res
    },
    onSuccess: (res) => {
      qc.setQueryData<ChatMessage[]>(
        chatKeys.messages(conversationId),
        (old) => {
          if (!old) return old
          return old.map((m) =>
            m.id === res.id
              ? { ...m, content: res.content, editedAt: res.editedAt }
              : m,
          )
        },
      )
    },
  })
}

export function useDeleteMessage(conversationId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (messageId: string) => {
      const res = await api.delete<{ id: string; deletedAt: string }>(
        `/api/v1/chat/conversations/${conversationId}/messages/${messageId}`,
      )
      return res
    },
    onSuccess: (res) => {
      qc.setQueryData<ChatMessage[]>(
        chatKeys.messages(conversationId),
        (old) => {
          if (!old) return old
          return old.map((m) =>
            m.id === res.id
              ? { ...m, content: '', deletedAt: res.deletedAt }
              : m,
          )
        },
      )
      qc.invalidateQueries({ queryKey: chatKeys.conversations() })
    },
  })
}

/**
 * Toggle a reaction on/off on a single message.  The mutation does
 * an optimistic patch of the messages cache so the chip appears /
 * disappears the moment the user clicks the popover; the server
 * response replaces the optimistic map with the canonical one.
 *
 * Pencil reference: ChatViewV3 reactions popover (`mCFcx`).
 */
export function useToggleReaction(conversationId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      messageId: string
      emoji: string
      userId: string
    }) => {
      const res = await api.post<{ id: string; reactions: ChatReactions }>(
        `/api/v1/chat/conversations/${conversationId}/messages/${input.messageId}/reactions`,
        { emoji: input.emoji },
      )
      return { ...res, userId: input.userId, emoji: input.emoji }
    },
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: chatKeys.messages(conversationId) })
      const prev = qc.getQueryData<ChatMessage[]>(
        chatKeys.messages(conversationId),
      )
      qc.setQueryData<ChatMessage[]>(
        chatKeys.messages(conversationId),
        (old) => {
          if (!old) return old
          return old.map((m) => {
            if (m.id !== input.messageId) return m
            const next: ChatReactions = {}
            for (const [emoji, ids] of Object.entries(m.reactions ?? {})) {
              next[emoji] = [...ids]
            }
            const list = next[input.emoji] ?? []
            const has = list.includes(input.userId)
            if (has) {
              const filtered = list.filter((id) => id !== input.userId)
              if (filtered.length === 0) {
                delete next[input.emoji]
              } else {
                next[input.emoji] = filtered
              }
            } else {
              next[input.emoji] = [...list, input.userId]
            }
            return { ...m, reactions: next }
          })
        },
      )
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) {
        qc.setQueryData<ChatMessage[]>(
          chatKeys.messages(conversationId),
          ctx.prev,
        )
      }
    },
    onSuccess: (res) => {
      qc.setQueryData<ChatMessage[]>(
        chatKeys.messages(conversationId),
        (old) => {
          if (!old) return old
          return old.map((m) =>
            m.id === res.id ? { ...m, reactions: res.reactions } : m,
          )
        },
      )
    },
  })
}

export function useSendMessage(conversationId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      content: string
      attachmentIds?: string[]
      senderId: string
      tempId: string
    }) => {
      const res = await api.post<{ id: string; createdAt: string }>(
        `/api/v1/chat/conversations/${conversationId}/messages`,
        { content: input.content, attachmentIds: input.attachmentIds },
      )
      return { ...res, tempId: input.tempId }
    },
    /// Optimistic insert so the bubble renders the moment the user
    /// hits Send.  We push a temporary message into the messages
    /// cache (status='sending') AND bump the conversation list's
    /// last-message + ordering so the inbox row reorders too.  When
    /// the server replies we swap the temp id for the real one and
    /// flip status to 'sent'; on error we mark it 'failed' so the
    /// caller can offer retry.
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: chatKeys.messages(conversationId) })
      const prevMessages = qc.getQueryData<ChatMessage[]>(
        chatKeys.messages(conversationId),
      )
      const prevConversations = qc.getQueryData<ConversationSummary[]>(
        chatKeys.conversations(),
      )
      const now = new Date().toISOString()
      const optimistic: ChatMessage = {
        id: input.tempId,
        conversationId,
        senderId: input.senderId,
        content: input.content,
        createdAt: now,
        _status: 'sending',
      }
      qc.setQueryData<ChatMessage[]>(
        chatKeys.messages(conversationId),
        (old) => (old ? [...old, optimistic] : [optimistic]),
      )
      qc.setQueryData<ConversationSummary[]>(
        chatKeys.conversations(),
        (old) => {
          if (!old) return old
          const next = old.map((c) =>
            c.id === conversationId
              ? {
                  ...c,
                  lastMessageAt: now,
                  lastMessage: {
                    id: input.tempId,
                    content: input.content,
                    senderId: input.senderId,
                    createdAt: now,
                  },
                }
              : c,
          )
          next.sort(
            (a, b) =>
              new Date(b.lastMessageAt).getTime() -
              new Date(a.lastMessageAt).getTime(),
          )
          return next
        },
      )
      // The inbox screen reads from the unified feed cache, not the
      // conversations cache — bump the row there too so the chat
      // list reorders the moment the user hits Send.  Prefix "You: "
      // to match the snippet shape the server returns on refetch
      // (avoids a flash when the canonical row lands).
      bumpFeedRow(
        qc,
        conversationId,
        {
          activityAt: now,
          snippet: `You: ${previewFor(input.content)}`,
        },
        false,
      )
      return { prevMessages, prevConversations }
    },
    onSuccess: (res) => {
      // Replace the optimistic temp message with the server payload
      // and mark it sent.  Avoids a full refetch — the server only
      // returns id+createdAt so we patch in place.
      qc.setQueryData<ChatMessage[]>(
        chatKeys.messages(conversationId),
        (old) => {
          if (!old) return old
          return old.map((m) =>
            m.id === res.tempId
              ? { ...m, id: res.id, createdAt: res.createdAt, _status: 'sent' }
              : m,
          )
        },
      )
      // Server has the canonical lastMessageAt now; invalidate so
      // any presence-ordered fields the cache might be missing
      // refresh in the background.
      qc.invalidateQueries({
        queryKey: chatKeys.conversations(),
        refetchType: 'none',
      })
    },
    onError: (_err, input) => {
      // Keep the bubble visible but mark it failed so the user can
      // retry from the composer affordance.
      qc.setQueryData<ChatMessage[]>(
        chatKeys.messages(conversationId),
        (old) => {
          if (!old) return old
          return old.map((m) =>
            m.id === input.tempId ? { ...m, _status: 'failed' } : m,
          )
        },
      )
    },
  })
}

/// Stage an attachment upload. The mutation returns the row id; the
/// caller passes that id to `useSendMessage` via `attachmentIds`.
/// Goes through `fetch` directly (not the JSON `api` helper) so we
/// can ship multipart bodies.
export function useUploadAttachment() {
  return useMutation({
    mutationFn: async (file: File): Promise<ChatAttachment> => {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(`${apiUrl}/api/v1/chat/attachments`, {
        method: 'POST',
        body: form,
        credentials: 'include',
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error?.message ?? `Upload failed (${res.status})`)
      }
      return res.json() as Promise<ChatAttachment>
    },
  })
}

/// Build a download URL for a chat attachment. Used to render image
/// previews and the file-chip download anchor — the client just
/// hits the GET endpoint directly with cookies.
export function chatAttachmentUrl(
  conversationId: string,
  attachmentId: string,
): string {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
  return `${apiUrl}/api/v1/chat/conversations/${conversationId}/attachments/${attachmentId}`
}

export function useNotifyTyping() {
  return useMutation({
    mutationFn: async (conversationId: string) => {
      // Fire-and-forget — typing pings are best-effort and we don't
      // want errors to surface in the composer UI.
      try {
        await api.post(`/api/v1/chat/conversations/${conversationId}/typing`)
      } catch {
        // ignore
      }
    },
  })
}

export function useMarkConversationRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (conversationId: string) => {
      await api.post(`/api/v1/chat/conversations/${conversationId}/read`)
      return conversationId
    },
    onSuccess: (conversationId) => {
      qc.setQueryData<ConversationSummary[]>(
        chatKeys.conversations(),
        (old) => {
          if (!old) return old
          return old.map((c) =>
            c.id === conversationId ? { ...c, unreadCount: 0 } : c,
          )
        },
      )
      // Clear the unread badge on the inbox feed row immediately so
      // the user sees the count drop the moment they open the chat.
      applyChatConversationRead(qc, { conversationId })
    },
  })
}

export function useCreateDirectConversation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (userEmail: string) => {
      const res = await api.post<{ id: string }>(
        '/api/v1/chat/conversations',
        { userEmail },
      )
      return res.id
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: chatKeys.conversations() })
    },
  })
}

export function useCreateGroupConversation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { title: string; participantIds: string[] }) => {
      const res = await api.post<{ id: string }>(
        '/api/v1/chat/conversations/group',
        input,
      )
      return res.id
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: chatKeys.conversations() })
    },
  })
}

export function useParticipants(conversationId: string | null) {
  return useQuery({
    queryKey: conversationId
      ? chatKeys.participants(conversationId)
      : ['chat', 'participants', 'none'],
    queryFn: async () => {
      if (!conversationId) return []
      const res = await api.get<{ participants: ContactSearchResult[] }>(
        `/api/v1/chat/conversations/${conversationId}/participants`,
      )
      return res.participants
    },
    enabled: !!conversationId,
  })
}

export function useAddParticipants(conversationId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (userIds: string[]) => {
      const res = await api.post<{ added: string[] }>(
        `/api/v1/chat/conversations/${conversationId}/participants`,
        { userIds },
      )
      return res.added
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: chatKeys.participants(conversationId) })
      qc.invalidateQueries({ queryKey: chatKeys.conversations() })
    },
  })
}

export function useRemoveParticipant(conversationId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (userId: string) => {
      await api.delete(
        `/api/v1/chat/conversations/${conversationId}/participants/${userId}`,
      )
      return userId
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: chatKeys.participants(conversationId) })
      qc.invalidateQueries({ queryKey: chatKeys.conversations() })
    },
  })
}

export function useChatSearch(query: string) {
  return useQuery({
    queryKey: ['chat', 'message-search', query],
    queryFn: async () => {
      const res = await api.get<{
        hits: ChatSearchHit[]
        total: number
        page: number
        pageSize: number
        available?: boolean
      }>(`/api/v1/chat/search?q=${encodeURIComponent(query)}`)
      return res
    },
    enabled: query.trim().length > 0,
    staleTime: 10_000,
  })
}

export function useContactSearch(query: string) {
  return useQuery({
    queryKey: chatKeys.search(query),
    queryFn: async () => {
      const res = await api.get<{ users: ContactSearchResult[] }>(
        `/api/v1/chat/users/search?q=${encodeURIComponent(query)}`,
      )
      return res.users
    },
    enabled: query.trim().length > 0,
    staleTime: 30_000,
  })
}

/// Realtime bridge helpers. Exposed so the bridge component can
/// fold WS events into the cache without hand-rolling key access.

export function applyChatMessageNew(
  qc: QueryClient,
  evt: {
    conversationId: string
    messageId: string
    senderId: string
    content: string
    createdAt: string
  },
) {
  qc.setQueryData<ChatMessage[]>(
    chatKeys.messages(evt.conversationId),
    (old) => {
      const incoming: ChatMessage = {
        id: evt.messageId,
        conversationId: evt.conversationId,
        senderId: evt.senderId,
        content: evt.content,
        createdAt: evt.createdAt,
      }
      if (!old) return [incoming]
      // Dedupe by both real id and optimistic temp ids: when the
      // sender's own POST resolves, onSuccess swaps the temp id for
      // the real one — but if a `chat.message.new` event for that
      // same message arrives over the bus first (multi-device echo)
      // we'd otherwise insert a duplicate.  Match on content +
      // senderId + a 5s window to fold the echo into the existing
      // optimistic row.
      if (old.some((m) => m.id === evt.messageId)) return old
      const idx = old.findIndex(
        (m) =>
          m.id.startsWith('temp-') &&
          m.senderId === evt.senderId &&
          m.content === evt.content &&
          Math.abs(
            new Date(m.createdAt).getTime() - new Date(evt.createdAt).getTime(),
          ) < 5_000,
      )
      if (idx !== -1) {
        const next = [...old]
        next[idx] = {
          ...next[idx],
          id: evt.messageId,
          createdAt: evt.createdAt,
          _status: 'sent',
        }
        return next
      }
      return [...old, incoming]
    },
  )
  // Also bump the unified inbox feed cache so the chat row jumps to
  // the top with the new snippet — same code path the optimistic
  // sender uses, just with `incrementUnread=true` since the message
  // arrived from someone else (the bus only fires for non-self
  // messages by design).
  bumpFeedRow(
    qc,
    evt.conversationId,
    { activityAt: evt.createdAt, snippet: previewFor(evt.content) },
    true,
  )
}

/// Truncate to the same shape the server uses for `snippet` on the
/// unified feed (~120 chars, single line).  Keeps the optimistic /
/// realtime preview visually consistent with the canonical row that
/// arrives on the next refetch.
function previewFor(content: string): string {
  const single = content.replace(/\s+/g, ' ').trim()
  return single.length > 120 ? single.slice(0, 117) + '…' : single
}

export function applyChatMessageUpdated(
  qc: QueryClient,
  evt: {
    conversationId: string
    messageId: string
    content: string
    editedAt: string
  },
) {
  qc.setQueryData<ChatMessage[]>(
    chatKeys.messages(evt.conversationId),
    (old) => {
      if (!old) return old
      return old.map((m) =>
        m.id === evt.messageId
          ? { ...m, content: evt.content, editedAt: evt.editedAt }
          : m,
      )
    },
  )
}

export function applyChatMessageReactionUpdated(
  qc: QueryClient,
  evt: {
    conversationId: string
    messageId: string
    reactions: ChatReactions
  },
) {
  qc.setQueryData<ChatMessage[]>(
    chatKeys.messages(evt.conversationId),
    (old) => {
      if (!old) return old
      return old.map((m) =>
        m.id === evt.messageId ? { ...m, reactions: evt.reactions } : m,
      )
    },
  )
}

export function applyChatMessageDeleted(
  qc: QueryClient,
  evt: { conversationId: string; messageId: string; deletedAt: string },
) {
  qc.setQueryData<ChatMessage[]>(
    chatKeys.messages(evt.conversationId),
    (old) => {
      if (!old) return old
      return old.map((m) =>
        m.id === evt.messageId
          ? { ...m, content: '', deletedAt: evt.deletedAt }
          : m,
      )
    },
  )
}

export function applyChatConversationRead(
  qc: QueryClient,
  evt: { conversationId: string },
) {
  // The seen-by avatars rely on the reads query — the simplest and
  // correct thing is to invalidate so it refetches on next render.
  qc.invalidateQueries({ queryKey: chatKeys.reads(evt.conversationId) })
  // Also clear the unread badge on the inbox feed row so the count
  // drops the moment the read event fires (without waiting for the
  // next /inbox/list refetch).
  const matches = qc.getQueriesData<InfiniteData<FeedPage>>({
    queryKey: ['inbox', 'feed'],
  })
  for (const [key, data] of matches) {
    if (!data) continue
    let touched = false
    const nextPages: FeedPage[] = data.pages.map((page) => ({
      ...page,
      data: page.data.map((it: FeedItem) => {
        if (
          (it.kind === 'chat-direct' || it.kind === 'chat-group') &&
          it.id === evt.conversationId &&
          (!it.isRead || it.unreadCount > 0)
        ) {
          touched = true
          return { ...it, isRead: true, unreadCount: 0 } as FeedItem
        }
        return it
      }),
    }))
    if (touched) {
      qc.setQueryData<InfiniteData<FeedPage>>(key, {
        ...data,
        pages: nextPages,
      })
    }
  }
}

export function applyChatConversationUpdated(
  qc: QueryClient,
  evt: {
    conversationId: string
    lastMessageAt: string
    unreadCount: number
  },
) {
  qc.setQueryData<ConversationSummary[]>(
    chatKeys.conversations(),
    (old) => {
      if (!old) return old
      const next = old.map((c) =>
        c.id === evt.conversationId
          ? {
              ...c,
              lastMessageAt: evt.lastMessageAt,
              unreadCount: evt.unreadCount,
            }
          : c,
      )
      // Re-sort so the bumped conversation surfaces.
      next.sort(
        (a, b) =>
          new Date(b.lastMessageAt).getTime() -
          new Date(a.lastMessageAt).getTime(),
      )
      return next
    },
  )
}
