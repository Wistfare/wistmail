/// Per-message read receipt entry. Returned by the conversation
/// reads endpoint; the UI buckets these by `messageId` to render
/// "seen by" avatars under the right bubble.
class ConversationReadEntry {
  const ConversationReadEntry({
    required this.messageId,
    required this.userId,
    required this.readAt,
  });

  final String messageId;
  final String userId;
  final DateTime readAt;

  factory ConversationReadEntry.fromJson(Map<String, dynamic> json) =>
      ConversationReadEntry(
        messageId: json['messageId'] as String,
        userId: json['userId'] as String,
        readAt: DateTime.parse(json['readAt'] as String).toLocal(),
      );
}
