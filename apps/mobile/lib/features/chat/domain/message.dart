class Message {
  const Message({
    required this.id,
    required this.conversationId,
    required this.senderId,
    required this.content,
    required this.createdAt,
  });

  final String id;
  final String conversationId;
  final String senderId;
  final String content;
  final DateTime createdAt;

  factory Message.fromJson(Map<String, dynamic> json) {
    return Message(
      id: json['id'] as String,
      conversationId: (json['conversationId'] as String?) ?? '',
      senderId: (json['senderId'] as String?) ?? '',
      content: (json['content'] as String?) ?? '',
      createdAt: DateTime.parse(json['createdAt'] as String).toLocal(),
    );
  }

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
