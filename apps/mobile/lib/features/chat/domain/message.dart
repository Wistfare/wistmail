class MessageAttachment {
  const MessageAttachment({
    required this.id,
    required this.filename,
    required this.contentType,
    required this.sizeBytes,
  });

  final String id;
  final String filename;
  final String contentType;
  final int sizeBytes;

  bool get isImage => contentType.startsWith('image/');

  factory MessageAttachment.fromJson(Map<String, dynamic> json) =>
      MessageAttachment(
        id: json['id'] as String,
        filename: (json['filename'] as String?) ?? 'untitled',
        contentType: (json['contentType'] as String?) ?? 'application/octet-stream',
        sizeBytes: (json['sizeBytes'] as num?)?.toInt() ?? 0,
      );
}

class Message {
  const Message({
    required this.id,
    required this.conversationId,
    required this.senderId,
    required this.content,
    required this.createdAt,
    this.editedAt,
    this.deletedAt,
    this.attachments = const [],
  });

  final String id;
  final String conversationId;
  final String senderId;
  final String content;
  final DateTime createdAt;
  /// Stamped when the sender edits the body in place. UI shows
  /// "(edited)" next to the timestamp when this is non-null.
  final DateTime? editedAt;
  /// Soft-delete marker. The row stays so reply context + ordering
  /// hold; the body is replaced with an empty string server-side.
  /// Clients render a placeholder bubble when this is non-null.
  final DateTime? deletedAt;
  /// File attachments. Empty for messages sent without files.
  /// Shipped in the same response as the message — no follow-up
  /// fetch needed to render chips.
  final List<MessageAttachment> attachments;

  bool get isDeleted => deletedAt != null;
  bool get isEdited => editedAt != null && deletedAt == null;

  factory Message.fromJson(Map<String, dynamic> json) {
    DateTime? optionalDate(dynamic v) {
      if (v == null) return null;
      if (v is String) return DateTime.parse(v).toLocal();
      return null;
    }

    final rawAttachments =
        (json['attachments'] as List<dynamic>?) ?? const [];
    return Message(
      id: json['id'] as String,
      conversationId: (json['conversationId'] as String?) ?? '',
      senderId: (json['senderId'] as String?) ?? '',
      content: (json['content'] as String?) ?? '',
      createdAt: DateTime.parse(json['createdAt'] as String).toLocal(),
      editedAt: optionalDate(json['editedAt']),
      deletedAt: optionalDate(json['deletedAt']),
      attachments: rawAttachments
          .map((a) => MessageAttachment.fromJson(a as Map<String, dynamic>))
          .toList(),
    );
  }

  Message copyWith({
    String? content,
    DateTime? editedAt,
    DateTime? deletedAt,
    List<MessageAttachment>? attachments,
  }) =>
      Message(
        id: id,
        conversationId: conversationId,
        senderId: senderId,
        content: content ?? this.content,
        createdAt: createdAt,
        editedAt: editedAt ?? this.editedAt,
        deletedAt: deletedAt ?? this.deletedAt,
        attachments: attachments ?? this.attachments,
      );

  bool isFromMe(String myUserId) => senderId == myUserId;

  String get timestamp {
    final now = DateTime.now();
    final hour = createdAt.hour;
    final minute = createdAt.minute.toString().padLeft(2, '0');
    final ampm = hour >= 12 ? 'PM' : 'AM';
    final displayHour = hour == 0 ? 12 : (hour > 12 ? hour - 12 : hour);
    final sameDay = createdAt.year == now.year &&
        createdAt.month == now.month &&
        createdAt.day == now.day;
    if (sameDay) return '$displayHour:$minute $ampm';
    return '${createdAt.month}/${createdAt.day} $displayHour:$minute $ampm';
  }
}
