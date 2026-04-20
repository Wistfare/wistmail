'use client'

import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  applySendStatus,
  applyServerUpdate,
  inboxKeys,
} from './email-queries'

/// Realtime → query-cache bridge. Subscribes to /api/v1/stream once
/// per session and forwards every email event into the cache so the
/// UI flips state without a refetch. Reconnects with a 1-2-4-8s
/// backoff capped at 30s — same envelope as the mobile WS client so
/// we don't get reconnect storms across devices.

interface EmailNewEvent {
  type: 'email.new'
  emailId: string
  mailboxId: string
  folder: string
  fromAddress: string
  toAddresses: string[]
  cc: string[]
  subject: string
  snippet: string
  isRead: boolean
  isStarred: boolean
  isDraft: boolean
  hasAttachments: boolean
  sizeBytes: number
  createdAt: string
  preview?: string
}

interface EmailUpdatedEvent {
  type: 'email.updated'
  emailId: string
  changes: { isRead?: boolean; isStarred?: boolean; folder?: string }
}

interface EmailDeletedEvent {
  type: 'email.deleted'
  emailId: string
}

interface EmailSendStatusEvent {
  type: 'email.send_status'
  emailId: string
  status: 'idle' | 'sending' | 'sent' | 'failed' | 'rate_limited'
  error: string | null
}

type RealtimeEvent =
  | EmailNewEvent
  | EmailUpdatedEvent
  | EmailDeletedEvent
  | EmailSendStatusEvent
  | { type: string }

function wsUrlFromApi(apiUrl: string): string {
  if (apiUrl.startsWith('https://')) return `wss://${apiUrl.slice(8)}/api/v1/stream`
  if (apiUrl.startsWith('http://')) return `ws://${apiUrl.slice(7)}/api/v1/stream`
  return `${apiUrl}/api/v1/stream`
}

export function RealtimeBridge() {
  const qc = useQueryClient()

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
        console.error('[realtime-bridge] failed to construct ws:', err)
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
            case 'email.new':
              // Drop the inbox/all caches so the new row appears.
              // Cheap because the list refetch is paginated and
              // hits the slim list endpoint.
              qc.invalidateQueries({ queryKey: inboxKeys.all })
              break
            case 'email.updated':
              applyServerUpdate(qc, (evt as EmailUpdatedEvent).emailId, (evt as EmailUpdatedEvent).changes)
              break
            case 'email.deleted':
              applyServerUpdate(qc, (evt as EmailDeletedEvent).emailId, { folder: 'trash' })
              break
            case 'email.send_status': {
              const e2 = evt as EmailSendStatusEvent
              applySendStatus(qc, e2.emailId, e2.status, e2.error)
              break
            }
            default:
              // Other event types (chat, etc.) are not consumed by the
              // inbox bridge; they'll be picked up by their own bridges.
              break
          }
        } catch (err) {
          console.error('[realtime-bridge] bad message:', err)
        }
      })

      ws.addEventListener('close', () => {
        ws = null
        scheduleReconnect()
      })

      ws.addEventListener('error', () => {
        // The 'close' handler will pick up the reconnect.
      })
    }

    connect()

    return () => {
      stopped = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      if (ws && ws.readyState <= WebSocket.OPEN) ws.close()
    }
  }, [qc])

  return null
}
