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
          subject: json['subject'] as String,
          preview: json['preview'] as String,
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
    required this.subject,
    required this.preview,
    required this.createdAt,
  });

  final String emailId;
  final String mailboxId;
  final String folder;
  final String fromAddress;
  final String subject;
  final String preview;
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
