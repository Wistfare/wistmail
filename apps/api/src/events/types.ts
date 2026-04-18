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
  | ChatMessageNewEvent
  | ChatConversationUpdatedEvent

export interface EmailNewEvent {
  type: 'email.new'
  userId: string
  emailId: string
  mailboxId: string
  folder: string
  fromAddress: string
  subject: string
  preview: string
  createdAt: string
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
