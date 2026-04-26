'use client'

import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  applyChatConversationRead,
  applyChatConversationUpdated,
  applyChatMessageDeleted,
  applyChatMessageNew,
  applyChatMessageUpdated,
  chatKeys,
} from './chat-queries'
import { useTypingPush } from './typing-bus'

/// Realtime → query-cache bridge for the chat module. Mirrors
/// `realtime-bridge.tsx` (which handles email events): one WS
/// connection per session, 1-2-4-8s reconnect backoff capped at 30s,
/// and forwards every chat-shaped event into the cache so threads
/// + the conversation list update without a refetch.
///
/// Two bridges run side-by-side because the email cache and the
/// chat cache live under different query keys and the email bridge
/// is intentionally narrow (see the comment in realtime-bridge.tsx).

interface ChatMessageNewEvent {
  type: 'chat.message.new'
  conversationId: string
  messageId: string
  senderId: string
  content: string
  createdAt: string
}

interface ChatConversationUpdatedEvent {
  type: 'chat.conversation.updated'
  conversationId: string
  lastMessageAt: string
  unreadCount: number
}

interface ChatMessageUpdatedEvent {
  type: 'chat.message.updated'
  conversationId: string
  messageId: string
  content: string
  editedAt: string
}

interface ChatMessageDeletedEvent {
  type: 'chat.message.deleted'
  conversationId: string
  messageId: string
  deletedAt: string
}

interface ChatConversationReadEvent {
  type: 'chat.conversation.read'
  conversationId: string
  readerId: string
  readAt: string
}

interface ChatTypingEvent {
  type: 'chat.typing'
  conversationId: string
  typerId: string
  typerName: string
  at: string
}

type RealtimeEvent =
  | ChatMessageNewEvent
  | ChatMessageUpdatedEvent
  | ChatMessageDeletedEvent
  | ChatConversationUpdatedEvent
  | ChatConversationReadEvent
  | ChatTypingEvent
  | { type: string }

function wsUrlFromApi(apiUrl: string): string {
  if (apiUrl.startsWith('https://')) return `wss://${apiUrl.slice(8)}/api/v1/stream`
  if (apiUrl.startsWith('http://')) return `ws://${apiUrl.slice(7)}/api/v1/stream`
  return `${apiUrl}/api/v1/stream`
}

export function ChatRealtimeBridge() {
  const qc = useQueryClient()
  const pushTyping = useTypingPush()

  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
    const wsUrl = wsUrlFromApi(apiUrl)

    let ws: WebSocket | null = null
    let attempt = 0
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let stopped = false

    function scheduleReconnect() {
      if (stopped) return
      const delay = Math.min(30_000, 1000 * 2 ** attempt)
      attempt += 1
      reconnectTimer = setTimeout(connect, delay)
    }

    function connect() {
      try {
        ws = new WebSocket(wsUrl)
      } catch (err) {
        console.error('[chat-realtime-bridge] failed to construct ws:', err)
        scheduleReconnect()
        return
      }

      ws.addEventListener('open', () => {
        attempt = 0
      })

      ws.addEventListener('message', (e: MessageEvent) => {
        try {
          const evt = JSON.parse(String(e.data)) as RealtimeEvent
          switch (evt.type) {
            case 'chat.message.new': {
              const e2 = evt as ChatMessageNewEvent
              applyChatMessageNew(qc, e2)
              // The conversation row's lastMessage / lastMessageAt
              // come along in `chat.conversation.updated`, fired on
              // the same send. But if the conversation isn't in the
              // cache yet (first message of a brand-new direct chat
              // landing on a fresh device), invalidate so it appears.
              qc.invalidateQueries({ queryKey: chatKeys.conversations() })
              break
            }
            case 'chat.conversation.updated': {
              const e2 = evt as ChatConversationUpdatedEvent
              applyChatConversationUpdated(qc, e2)
              break
            }
            case 'chat.message.updated': {
              const e2 = evt as ChatMessageUpdatedEvent
              applyChatMessageUpdated(qc, e2)
              break
            }
            case 'chat.message.deleted': {
              const e2 = evt as ChatMessageDeletedEvent
              applyChatMessageDeleted(qc, e2)
              // The conversation list might need a new preview if the
              // deleted message was the last one shown.
              qc.invalidateQueries({ queryKey: chatKeys.conversations() })
              break
            }
            case 'chat.conversation.read': {
              const e2 = evt as ChatConversationReadEvent
              applyChatConversationRead(qc, e2)
              break
            }
            case 'chat.typing': {
              const e2 = evt as ChatTypingEvent
              pushTyping({
                conversationId: e2.conversationId,
                typerId: e2.typerId,
                typerName: e2.typerName,
              })
              break
            }
            default:
              // Email + other event types are handled by their own
              // bridges (see realtime-bridge.tsx).
              break
          }
        } catch (err) {
          console.error('[chat-realtime-bridge] bad message:', err)
        }
      })

      ws.addEventListener('close', () => {
        ws = null
        scheduleReconnect()
      })

      ws.addEventListener('error', () => {
        // 'close' picks up the reconnect.
      })
    }

    connect()

    return () => {
      stopped = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      if (ws && ws.readyState <= WebSocket.OPEN) ws.close()
    }
  }, [qc, pushTyping])

  return null
}
