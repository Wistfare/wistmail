/// Wrapped search response: the hits plus a flag that's `false`
/// when the backend is missing the MEILI configuration (clients
/// surface a distinct "search isn't configured" message instead of
/// a generic "no matches").
class ChatSearchResult {
  const ChatSearchResult({required this.hits, required this.available});
  final List<ChatSearchHit> hits;
  final bool available;
}

/// Single match returned by the chat full-text search endpoint.
/// Tapping a hit navigates to its conversation.
class ChatSearchHit {
  const ChatSearchHit({
    required this.messageId,
    required this.conversationId,
    required this.conversationTitle,
    required this.senderId,
    required this.senderName,
    required this.content,
    required this.createdAt,
  });

  final String messageId;
  final String conversationId;
  final String? conversationTitle;
  final String senderId;
  final String senderName;
  final String content;
  final DateTime createdAt;

  factory ChatSearchHit.fromJson(Map<String, dynamic> json) => ChatSearchHit(
        messageId: json['messageId'] as String,
        conversationId: json['conversationId'] as String,
        conversationTitle: json['conversationTitle'] as String?,
        senderId: json['senderId'] as String,
        senderName: (json['senderName'] as String?) ?? 'Member',
        content: (json['content'] as String?) ?? '',
        createdAt: DateTime.parse(json['createdAt'] as String).toLocal(),
      );
}
