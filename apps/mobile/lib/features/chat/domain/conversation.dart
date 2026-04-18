import 'package:flutter/material.dart';

class Participant {
  const Participant({
    required this.id,
    required this.name,
    required this.email,
    this.avatarUrl,
  });

  final String id;
  final String name;
  final String email;
  final String? avatarUrl;

  factory Participant.fromJson(Map<String, dynamic> json) {
    return Participant(
      id: json['id'] as String,
      name: (json['name'] as String?) ?? '',
      email: (json['email'] as String?) ?? '',
      avatarUrl: json['avatarUrl'] as String?,
    );
  }
}

class LastMessage {
  const LastMessage({
    required this.id,
    required this.content,
    required this.senderId,
    required this.createdAt,
  });

  final String id;
  final String content;
  final String senderId;
  final DateTime createdAt;

  factory LastMessage.fromJson(Map<String, dynamic> json) {
    return LastMessage(
      id: json['id'] as String,
      content: (json['content'] as String?) ?? '',
      senderId: (json['senderId'] as String?) ?? '',
      createdAt: DateTime.parse(json['createdAt'] as String).toLocal(),
    );
  }
}

class Conversation {
  const Conversation({
    required this.id,
    required this.kind,
    this.title,
    required this.otherParticipants,
    required this.lastMessageAt,
    required this.unreadCount,
    this.lastMessage,
  });

  final String id;
  final String kind;
  final String? title;
  final List<Participant> otherParticipants;
  final DateTime lastMessageAt;
  final int unreadCount;
  final LastMessage? lastMessage;

  factory Conversation.fromJson(Map<String, dynamic> json) {
    final others = (json['otherParticipants'] as List<dynamic>? ?? [])
        .map((p) => Participant.fromJson(p as Map<String, dynamic>))
        .toList();
    return Conversation(
      id: json['id'] as String,
      kind: (json['kind'] as String?) ?? 'direct',
      title: json['title'] as String?,
      otherParticipants: others,
      lastMessageAt: DateTime.parse(json['lastMessageAt'] as String).toLocal(),
      unreadCount: (json['unreadCount'] as num?)?.toInt() ?? 0,
      lastMessage: json['lastMessage'] == null
          ? null
          : LastMessage.fromJson(json['lastMessage'] as Map<String, dynamic>),
    );
  }

  /// Display name for the conversation — title for groups, the other
  /// participant's name for direct conversations.
  String get displayName {
    if (title != null && title!.isNotEmpty) return title!;
    if (otherParticipants.isEmpty) return 'Conversation';
    return otherParticipants.map((p) => p.name).join(', ');
  }

  String get displayInitials {
    final name = displayName.trim();
    final parts = name.split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
    if (parts.isEmpty) return '?';
    if (parts.length == 1) return parts[0].substring(0, 1).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  Color get avatarColor {
    final palette = [
      const Color(0xFF2D4A1A),
      const Color(0xFF6D3A8A),
      const Color(0xFF1A4A3A),
      const Color(0xFF3A2D6A),
      const Color(0xFF4A3A1A),
      const Color(0xFF4A1A2D),
    ];
    final hash = id.codeUnits.fold<int>(0, (a, b) => a + b);
    return palette[hash % palette.length];
  }

  String get lastMessagePreview {
    if (lastMessage == null) return '';
    final content = lastMessage!.content;
    return content.length > 120 ? '${content.substring(0, 120)}…' : content;
  }

  String get timeAgo => _formatTimeAgo(lastMessageAt);

  Conversation copyWith({
    int? unreadCount,
    DateTime? lastMessageAt,
    LastMessage? lastMessage,
  }) =>
      Conversation(
        id: id,
        kind: kind,
        title: title,
        otherParticipants: otherParticipants,
        lastMessageAt: lastMessageAt ?? this.lastMessageAt,
        unreadCount: unreadCount ?? this.unreadCount,
        lastMessage: lastMessage ?? this.lastMessage,
      );
}

String _formatTimeAgo(DateTime date) {
  final diff = DateTime.now().difference(date);
  if (diff.inSeconds < 60) return 'now';
  if (diff.inMinutes < 60) return '${diff.inMinutes}m';
  if (diff.inHours < 24) return '${diff.inHours}h';
  if (diff.inDays < 7) return '${diff.inDays}d';
  return '${(diff.inDays / 7).floor()}w';
}
