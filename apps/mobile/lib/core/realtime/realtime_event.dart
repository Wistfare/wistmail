/// Events arriving over the WebSocket stream. Mirrors the backend
/// `RealtimeEvent` union in apps/api/src/events/types.ts — add a new variant
/// on both sides when a new event type is introduced.
sealed class RealtimeEvent {
  const RealtimeEvent();

  static RealtimeEvent? fromJson(Map<String, dynamic> json) {
    final type = json['type'] as String?;
    switch (type) {
      case 'connection.ready':
        return const ConnectionReadyEvent();
      case 'email.new':
        return EmailNewEvent(
          emailId: json['emailId'] as String,
          mailboxId: json['mailboxId'] as String,
          folder: json['folder'] as String,
          fromAddress: json['fromAddress'] as String,
          toAddresses: (json['toAddresses'] as List?)?.whereType<String>().toList() ?? const [],
          cc: (json['cc'] as List?)?.whereType<String>().toList() ?? const [],
          subject: json['subject'] as String,
          // Server now carries the full snippet (max 200 chars). Older
          // server versions only sent `preview` (140 chars) — fall back.
          snippet: (json['snippet'] as String?) ?? (json['preview'] as String? ?? ''),
          isRead: (json['isRead'] as bool?) ?? false,
          isStarred: (json['isStarred'] as bool?) ?? false,
          isDraft: (json['isDraft'] as bool?) ?? false,
          hasAttachments: (json['hasAttachments'] as bool?) ?? false,
          sizeBytes: (json['sizeBytes'] as num?)?.toInt() ?? 0,
          preview: json['preview'] as String? ?? '',
          createdAt: DateTime.parse(json['createdAt'] as String),
        );
      case 'email.updated':
        final changes = (json['changes'] as Map?)?.cast<String, dynamic>() ?? {};
        return EmailUpdatedEvent(
          emailId: json['emailId'] as String,
          isRead: changes['isRead'] as bool?,
          isStarred: changes['isStarred'] as bool?,
          folder: changes['folder'] as String?,
        );
      case 'email.deleted':
        return EmailDeletedEvent(emailId: json['emailId'] as String);
      case 'email.send_status':
        return EmailSendStatusEvent(
          emailId: json['emailId'] as String,
          status: (json['status'] as String?) ?? 'idle',
          error: json['error'] as String?,
        );
      case 'chat.message.new':
        return ChatMessageNewEvent(
          conversationId: json['conversationId'] as String,
          messageId: json['messageId'] as String,
          senderId: json['senderId'] as String,
          content: json['content'] as String,
          createdAt: DateTime.parse(json['createdAt'] as String),
        );
      case 'chat.conversation.updated':
        return ChatConversationUpdatedEvent(
          conversationId: json['conversationId'] as String,
          lastMessageAt: DateTime.parse(json['lastMessageAt'] as String),
          unreadCount: (json['unreadCount'] as num).toInt(),
        );
      case 'chat.message.updated':
        return ChatMessageUpdatedEvent(
          conversationId: json['conversationId'] as String,
          messageId: json['messageId'] as String,
          content: json['content'] as String,
          editedAt: DateTime.parse(json['editedAt'] as String),
        );
      case 'chat.message.deleted':
        return ChatMessageDeletedEvent(
          conversationId: json['conversationId'] as String,
          messageId: json['messageId'] as String,
          deletedAt: DateTime.parse(json['deletedAt'] as String),
        );
      case 'chat.conversation.read':
        return ChatConversationReadEvent(
          conversationId: json['conversationId'] as String,
          readerId: json['readerId'] as String,
          readAt: DateTime.parse(json['readAt'] as String),
        );
      case 'chat.typing':
        return ChatTypingEvent(
          conversationId: json['conversationId'] as String,
          typerId: json['typerId'] as String,
          typerName: (json['typerName'] as String?) ?? 'Someone',
          at: DateTime.parse(json['at'] as String),
        );
      default:
        return null;
    }
  }
}

class ConnectionReadyEvent extends RealtimeEvent {
  const ConnectionReadyEvent();
}

class EmailNewEvent extends RealtimeEvent {
  const EmailNewEvent({
    required this.emailId,
    required this.mailboxId,
    required this.folder,
    required this.fromAddress,
    this.toAddresses = const [],
    this.cc = const [],
    required this.subject,
    this.snippet = '',
    this.isRead = false,
    this.isStarred = false,
    this.isDraft = false,
    this.hasAttachments = false,
    this.sizeBytes = 0,
    this.preview = '',
    required this.createdAt,
  });

  final String emailId;
  final String mailboxId;
  final String folder;
  final String fromAddress;
  final List<String> toAddresses;
  final List<String> cc;
  final String subject;
  final String snippet;
  final bool isRead;
  final bool isStarred;
  final bool isDraft;
  final bool hasAttachments;
  final int sizeBytes;
  final String preview; // legacy alias retained for the body fallback
  final DateTime createdAt;
}

class EmailUpdatedEvent extends RealtimeEvent {
  const EmailUpdatedEvent({
    required this.emailId,
    this.isRead,
    this.isStarred,
    this.folder,
  });

  final String emailId;
  final bool? isRead;
  final bool? isStarred;
  final String? folder;
}

class EmailDeletedEvent extends RealtimeEvent {
  const EmailDeletedEvent({required this.emailId});
  final String emailId;
}

/// Lifecycle transition for an outbound email — flips the row's
/// "Sending…" pill to Sent / Failed / Queued without a refetch.
class EmailSendStatusEvent extends RealtimeEvent {
  const EmailSendStatusEvent({
    required this.emailId,
    required this.status,
    this.error,
  });

  final String emailId;
  final String status; // 'idle' | 'sending' | 'sent' | 'failed' | 'rate_limited'
  final String? error;
}

class ChatMessageNewEvent extends RealtimeEvent {
  const ChatMessageNewEvent({
    required this.conversationId,
    required this.messageId,
    required this.senderId,
    required this.content,
    required this.createdAt,
  });

  final String conversationId;
  final String messageId;
  final String senderId;
  final String content;
  final DateTime createdAt;
}

class ChatConversationUpdatedEvent extends RealtimeEvent {
  const ChatConversationUpdatedEvent({
    required this.conversationId,
    required this.lastMessageAt,
    required this.unreadCount,
  });

  final String conversationId;
  final DateTime lastMessageAt;
  final int unreadCount;
}

/// Sender edited a message body. Receivers patch their local message
/// list so the new content + "(edited)" stamp shows up without a
/// refetch.
class ChatMessageUpdatedEvent extends RealtimeEvent {
  const ChatMessageUpdatedEvent({
    required this.conversationId,
    required this.messageId,
    required this.content,
    required this.editedAt,
  });

  final String conversationId;
  final String messageId;
  final String content;
  final DateTime editedAt;
}

/// Sender soft-deleted a message. Receivers blank the body in their
/// local cache and render a placeholder bubble.
class ChatMessageDeletedEvent extends RealtimeEvent {
  const ChatMessageDeletedEvent({
    required this.conversationId,
    required this.messageId,
    required this.deletedAt,
  });

  final String conversationId;
  final String messageId;
  final DateTime deletedAt;
}

/// A user opened a conversation, marking everything in it as read.
/// Fan-out to all participants — the sender uses this to refresh the
/// "seen by" avatars under their messages.
class ChatConversationReadEvent extends RealtimeEvent {
  const ChatConversationReadEvent({
    required this.conversationId,
    required this.readerId,
    required this.readAt,
  });

  final String conversationId;
  final String readerId;
  final DateTime readAt;
}

/// Ephemeral "user is typing" ping. The conversation controller
/// folds incoming events into a per-typer expiry timer (5 s default)
/// and exposes the live set to the bubble screen.
class ChatTypingEvent extends RealtimeEvent {
  const ChatTypingEvent({
    required this.conversationId,
    required this.typerId,
    required this.typerName,
    required this.at,
  });

  final String conversationId;
  final String typerId;
  final String typerName;
  final DateTime at;
}
