/**
 * Realtime events broadcast to authenticated clients over WebSocket.
 *
 * Every event is scoped to a userId — the WS server only forwards events whose
 * userId matches the connected user. The `type` field discriminates the payload.
 */

export type RealtimeEvent =
  | EmailNewEvent
  | EmailUpdatedEvent
  | EmailDeletedEvent
  | EmailSendStatusEvent
  | ChatMessageNewEvent
  | ChatConversationUpdatedEvent

/// Carries the full slim list-row payload so subscribers can render the
/// new inbox row without a second HTTP fetch.
export interface EmailNewEvent {
  type: 'email.new'
  userId: string
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
  /// @deprecated Use `snippet`. Retained for older clients during rollout.
  preview: string
}

export interface EmailUpdatedEvent {
  type: 'email.updated'
  userId: string
  emailId: string
  changes: {
    isRead?: boolean
    isStarred?: boolean
    folder?: string
  }
}

export interface EmailDeletedEvent {
  type: 'email.deleted'
  userId: string
  emailId: string
}

/// Send-state transitions for an outbound email — used by clients to
/// flip the "Sending…" pill to "Sent", "Couldn't send", or
/// "Rate-limited, retrying" without a refetch.
export interface EmailSendStatusEvent {
  type: 'email.send_status'
  userId: string
  emailId: string
  status: 'idle' | 'sending' | 'sent' | 'failed' | 'rate_limited'
  error: string | null
}

export interface ChatMessageNewEvent {
  type: 'chat.message.new'
  userId: string
  conversationId: string
  messageId: string
  senderId: string
  content: string
  createdAt: string
}

export interface ChatConversationUpdatedEvent {
  type: 'chat.conversation.updated'
  userId: string
  conversationId: string
  lastMessageAt: string
  unreadCount: number
}
