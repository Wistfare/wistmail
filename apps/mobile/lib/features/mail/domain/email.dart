import 'package:flutter/material.dart';

class Email {
  const Email({
    required this.id,
    required this.fromAddress,
    required this.toAddresses,
    this.cc = const [],
    this.bcc = const [],
    required this.subject,
    this.textBody,
    this.htmlBody,
    required this.folder,
    required this.isRead,
    required this.isStarred,
    required this.isDraft,
    required this.createdAt,
    this.mailboxId,
    this.attachments = const [],
  });

  final String id;
  final String fromAddress;
  final List<String> toAddresses;
  final List<String> cc;
  final List<String> bcc;
  final String subject;
  final String? textBody;
  final String? htmlBody;
  final String folder;
  final bool isRead;
  final bool isStarred;
  final bool isDraft;
  final DateTime createdAt;
  final String? mailboxId;
  final List<EmailAttachment> attachments;

  factory Email.fromJson(Map<String, dynamic> json) {
    return Email(
      id: json['id'] as String,
      fromAddress: (json['fromAddress'] as String?) ?? '',
      toAddresses: _asStringList(json['toAddresses']),
      cc: _asStringList(json['cc']),
      bcc: _asStringList(json['bcc']),
      subject: (json['subject'] as String?) ?? '',
      textBody: json['textBody'] as String?,
      htmlBody: json['htmlBody'] as String?,
      folder: (json['folder'] as String?) ?? 'inbox',
      isRead: (json['isRead'] as bool?) ?? false,
      isStarred: (json['isStarred'] as bool?) ?? false,
      isDraft: (json['isDraft'] as bool?) ?? false,
      mailboxId: json['mailboxId'] as String?,
      createdAt: _parseDate(json['createdAt']),
      attachments: (json['attachments'] as List<dynamic>? ?? [])
          .map((a) => EmailAttachment.fromJson(a as Map<String, dynamic>))
          .toList(),
    );
  }

  Email copyWith({bool? isRead, bool? isStarred, String? folder}) => Email(
        id: id,
        fromAddress: fromAddress,
        toAddresses: toAddresses,
        cc: cc,
        bcc: bcc,
        subject: subject,
        textBody: textBody,
        htmlBody: htmlBody,
        folder: folder ?? this.folder,
        isRead: isRead ?? this.isRead,
        isStarred: isStarred ?? this.isStarred,
        isDraft: isDraft,
        createdAt: createdAt,
        mailboxId: mailboxId,
        attachments: attachments,
      );

  String get senderName {
    final match = RegExp(r'^\s*(.*?)\s*<(.+)>\s*$').firstMatch(fromAddress);
    if (match != null) {
      final name = match.group(1)?.replaceAll('"', '').trim() ?? '';
      if (name.isNotEmpty) return name;
      return match.group(2) ?? fromAddress;
    }
    final atIndex = fromAddress.indexOf('@');
    if (atIndex > 0) return fromAddress.substring(0, atIndex);
    return fromAddress;
  }

  String get senderEmail {
    final match = RegExp(r'<(.+)>').firstMatch(fromAddress);
    return match?.group(1) ?? fromAddress;
  }

  String get senderInitials {
    final name = senderName.trim();
    final parts = name.split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
    if (parts.isEmpty) return '?';
    if (parts.length == 1) return parts[0].substring(0, 1).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  Color get senderAvatarColor {
    final palette = [
      const Color(0xFF2D4A1A),
      const Color(0xFF4A2D1A),
      const Color(0xFF1A2D4A),
      const Color(0xFF3A1A4A),
      const Color(0xFF1A3A2D),
      const Color(0xFF4A3A1A),
    ];
    final hash = fromAddress.codeUnits.fold<int>(0, (a, b) => a + b);
    return palette[hash % palette.length];
  }

  String get preview {
    final text = textBody ?? '';
    final normalized = text.replaceAll(RegExp(r'\s+'), ' ').trim();
    if (normalized.length <= 140) return normalized;
    return '${normalized.substring(0, 140)}…';
  }

  String get timeAgo => _formatTimeAgo(createdAt);

  static List<String> _asStringList(dynamic raw) {
    if (raw is List) {
      return raw.whereType<String>().toList();
    }
    return const [];
  }

  static DateTime _parseDate(dynamic raw) {
    if (raw is String) {
      return DateTime.tryParse(raw)?.toLocal() ?? DateTime.now();
    }
    return DateTime.now();
  }
}

class EmailAttachment {
  const EmailAttachment({
    required this.id,
    required this.filename,
    required this.contentType,
    required this.sizeBytes,
  });

  final String id;
  final String filename;
  final String contentType;
  final int sizeBytes;

  factory EmailAttachment.fromJson(Map<String, dynamic> json) {
    return EmailAttachment(
      id: json['id'] as String,
      filename: (json['filename'] as String?) ?? '',
      contentType: (json['contentType'] as String?) ?? '',
      sizeBytes: (json['sizeBytes'] as int?) ?? 0,
    );
  }
}

class Mailbox {
  const Mailbox({
    required this.id,
    required this.address,
    required this.displayName,
  });

  final String id;
  final String address;
  final String displayName;

  factory Mailbox.fromJson(Map<String, dynamic> json) {
    return Mailbox(
      id: json['id'] as String,
      address: (json['address'] as String?) ?? '',
      displayName: (json['displayName'] as String?) ?? '',
    );
  }
}

class EmailPage {
  const EmailPage({
    required this.emails,
    required this.total,
    required this.page,
    required this.pageSize,
    required this.hasMore,
  });

  final List<Email> emails;
  final int total;
  final int page;
  final int pageSize;
  final bool hasMore;

  factory EmailPage.fromJson(Map<String, dynamic> json) {
    final raw = (json['data'] as List<dynamic>? ?? [])
        .map((e) => Email.fromJson(e as Map<String, dynamic>))
        .toList();
    return EmailPage(
      emails: raw,
      total: (json['total'] as int?) ?? raw.length,
      page: (json['page'] as int?) ?? 1,
      pageSize: (json['pageSize'] as int?) ?? raw.length,
      hasMore: (json['hasMore'] as bool?) ?? false,
    );
  }
}

class ComposeDraft {
  const ComposeDraft({
    required this.fromAddress,
    required this.mailboxId,
    required this.toAddresses,
    this.cc = const [],
    this.bcc = const [],
    this.subject = '',
    this.textBody,
    this.htmlBody,
    this.send = true,
  });

  final String fromAddress;
  final String mailboxId;
  final List<String> toAddresses;
  final List<String> cc;
  final List<String> bcc;
  final String subject;
  final String? textBody;
  final String? htmlBody;
  final bool send;

  Map<String, dynamic> toJson() => {
        'fromAddress': fromAddress,
        'mailboxId': mailboxId,
        'toAddresses': toAddresses,
        if (cc.isNotEmpty) 'cc': cc,
        if (bcc.isNotEmpty) 'bcc': bcc,
        'subject': subject,
        if (textBody != null) 'textBody': textBody,
        if (htmlBody != null) 'htmlBody': htmlBody,
        'send': send,
      };
}

String _formatTimeAgo(DateTime date) {
  final diff = DateTime.now().difference(date);
  if (diff.inSeconds < 60) return 'now';
  if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
  if (diff.inHours < 24) return '${diff.inHours}h ago';
  if (diff.inDays < 7) return '${diff.inDays}d ago';
  return '${(diff.inDays / 7).floor()}w ago';
}
