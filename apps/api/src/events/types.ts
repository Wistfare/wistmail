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
  | ChatMessageUpdatedEvent
  | ChatMessageDeletedEvent
  | ChatConversationUpdatedEvent
  | ChatConversationReadEvent
  | ChatTypingEvent

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
    // ISO timestamp while snoozed, null once unsnoozed. Clients use
    // this to flip the row into / out of the synthetic "snoozed"
    // folder without a refetch.
    snoozeUntil?: string | null
    // ISO timestamp while a send is scheduled, null once dispatched
    // or cancelled.
    scheduledAt?: string | null
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

/// Sender edited a message body. Fan-out to every participant of the
/// conversation so threads update without a refetch. `editedAt` is
/// the new edit-time stamp so clients can render "(edited)".
export interface ChatMessageUpdatedEvent {
  type: 'chat.message.updated'
  userId: string
  conversationId: string
  messageId: string
  content: string
  editedAt: string
}

/// Sender soft-deleted a message. Fan-out to every participant. The
/// row stays for ordering / reply context; clients render a placeholder
/// bubble keyed off this event so the body can never reappear.
export interface ChatMessageDeletedEvent {
  type: 'chat.message.deleted'
  userId: string
  conversationId: string
  messageId: string
  deletedAt: string
}

/// User opened a conversation, marking everything in it as read.
/// Sent to ALL participants so seen-by avatars update for the
/// sender's view too. Receivers refetch reads on demand.
export interface ChatConversationReadEvent {
  type: 'chat.conversation.read'
  userId: string
  conversationId: string
  readerId: string
  readAt: string
}

/// Ephemeral "user is typing" ping. Not persisted. Clients debounce
/// emission (one ping every ~3s while keystrokes flow) and treat the
/// indicator as expired ~5s after the last received event for a given
/// (conversationId, typerId) pair.
export interface ChatTypingEvent {
  type: 'chat.typing'
  userId: string
  conversationId: string
  typerId: string
  typerName: string
  at: string
}
