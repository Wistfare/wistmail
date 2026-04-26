'use client'

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'
import { api } from './api-client'

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

export interface ChatMessage {
  id: string
  conversationId: string
  senderId: string
  content: string
  createdAt: string
  editedAt?: string | null
  deletedAt?: string | null
  attachments?: ChatAttachment[]
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

export function useSendMessage(conversationId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: string | { content: string; attachmentIds?: string[] }) => {
      const body =
        typeof input === 'string'
          ? { content: input }
          : { content: input.content, attachmentIds: input.attachmentIds }
      const res = await api.post<{ id: string; createdAt: string }>(
        `/api/v1/chat/conversations/${conversationId}/messages`,
        body,
      )
      return res
    },
    onSuccess: () => {
      // The realtime bridge will fold incoming messages into the
      // cache for *other* participants, but the sender doesn't get
      // a `chat.message.new` event back (by design — we don't want
      // every client deduping). So invalidate locally so the row
      // we just sent appears.
      qc.invalidateQueries({ queryKey: chatKeys.messages(conversationId) })
      qc.invalidateQueries({ queryKey: chatKeys.conversations() })
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
      // Dedupe: a sender's own POST already invalidates and refetches,
      // and that refetch may race with an event arriving from the bus
      // (an unlikely-but-possible self-route case). Either way, never
      // duplicate.
      if (old.some((m) => m.id === evt.messageId)) return old
      return [...old, incoming]
    },
  )
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
