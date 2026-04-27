// Shared row domain object for the MobileV3 unified Inbox. Each item
// carries a `source` so the row widget can render the right sub-layout
// without the screen needing two list paths.

enum UnifiedSource { mail, chat }

class UnifiedInboxItem {
  const UnifiedInboxItem({
    required this.source,
    required this.id,
    required this.occurredAt,
    required this.senderName,
    required this.senderKey,
    required this.preview,
    required this.subtitle,
    required this.isUnread,
    this.emailId,
    this.threadId,
    this.needsReply = false,
    this.conversationId,
    this.chatKind,
  });

  final UnifiedSource source;
  final String id; // "mail:<id>" or "chat:<id>"
  final DateTime occurredAt;
  final String senderName;
  final String senderKey;
  final String preview;
  final String subtitle;
  final bool isUnread;

  // Mail-only
  final String? emailId;
  final String? threadId;
  final bool needsReply;

  // Chat-only
  final String? conversationId;
  final String? chatKind; // 'direct' | 'group'

  UnifiedInboxItem copyWith({bool? isUnread}) => UnifiedInboxItem(
        source: source,
        id: id,
        occurredAt: occurredAt,
        senderName: senderName,
        senderKey: senderKey,
        preview: preview,
        subtitle: subtitle,
        isUnread: isUnread ?? this.isUnread,
        emailId: emailId,
        threadId: threadId,
        needsReply: needsReply,
        conversationId: conversationId,
        chatKind: chatKind,
      );

  factory UnifiedInboxItem.fromJson(Map<String, dynamic> json) {
    final sourceRaw = json['source'] as String;
    final source =
        sourceRaw == 'chat' ? UnifiedSource.chat : UnifiedSource.mail;
    final mail = (json['mail'] as Map?)?.cast<String, dynamic>();
    final chat = (json['chat'] as Map?)?.cast<String, dynamic>();
    return UnifiedInboxItem(
      source: source,
      id: json['id'] as String,
      occurredAt: DateTime.parse(json['occurredAt'] as String),
      senderName: (json['senderName'] as String?) ?? 'Someone',
      senderKey: (json['senderKey'] as String?) ?? '',
      preview: (json['preview'] as String?) ?? '',
      subtitle: (json['subtitle'] as String?) ?? '',
      isUnread: json['isUnread'] as bool? ?? false,
      emailId: mail?['emailId'] as String?,
      threadId: mail?['threadId'] as String?,
      needsReply: mail?['needsReply'] as bool? ?? false,
      conversationId: chat?['conversationId'] as String?,
      chatKind: chat?['kind'] as String?,
    );
  }
}

enum UnifiedFilter { all, mail, chats }

class UnifiedInboxPage {
  const UnifiedInboxPage({
    required this.items,
    required this.hasMore,
    this.nextCursor,
  });

  final List<UnifiedInboxItem> items;
  final bool hasMore;
  final String? nextCursor;

  factory UnifiedInboxPage.fromJson(Map<String, dynamic> json) =>
      UnifiedInboxPage(
        items: ((json['items'] as List?) ?? const [])
            .whereType<Map<String, dynamic>>()
            .map(UnifiedInboxItem.fromJson)
            .toList(growable: false),
        hasMore: json['hasMore'] as bool? ?? false,
        nextCursor: json['nextCursor'] as String?,
      );

  static const empty =
      UnifiedInboxPage(items: [], hasMore: false, nextCursor: null);
}
