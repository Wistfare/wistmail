import 'package:flutter/material.dart';

/// Static regexes — compiled once. The previous implementation rebuilt
/// these on every list-row paint; under scroll that was measurable jank.
final RegExp _whitespaceRegex = RegExp(r'\s+');
final RegExp _angleBracketSenderRegex = RegExp(r'^\s*(.*?)\s*<(.+)>\s*$');
final RegExp _angleBracketEmailRegex = RegExp(r'<(.+)>');

/// Initials use whitespace-only splitting to preserve the documented
/// behavior: 'alex.chen' → 'A', not 'AC'. Display names with spaces
/// like 'Alex Chen' still produce 'AC'.
final RegExp _splitDelimRegex = RegExp(r'\s+');

/// Small palette used to color avatar fallbacks. Stable per address so a
/// given sender always shows the same swatch.
const List<Color> _avatarPalette = [
  Color(0xFF2D4A1A),
  Color(0xFF4A2D1A),
  Color(0xFF1A2D4A),
  Color(0xFF3A1A4A),
  Color(0xFF1A3A2D),
  Color(0xFF4A3A1A),
];

class Email {
  Email({
    required this.id,
    required this.fromAddress,
    required this.toAddresses,
    this.cc = const [],
    this.bcc = const [],
    required this.subject,
    this.snippet = '',
    this.textBody,
    this.htmlBody,
    required this.folder,
    required this.isRead,
    required this.isStarred,
    required this.isDraft,
    this.hasAttachments = false,
    this.sizeBytes = 0,
    this.status = 'idle',
    this.sendError,
    required this.createdAt,
    DateTime? updatedAt,
    this.mailboxId,
    this.attachments = const [],
    this.labels = const [],
    this.threadId,
  }) : updatedAt = updatedAt ?? createdAt,
       senderName = _extractSenderName(fromAddress),
       senderEmail = _extractSenderEmail(fromAddress),
       senderInitials = _initialsFor(_extractSenderName(fromAddress)),
       senderAvatarColor = _colorFor(fromAddress),
       preview = _buildPreview(snippet, textBody);

  final String id;
  final String fromAddress;
  final List<String> toAddresses;
  final List<String> cc;
  final List<String> bcc;
  final String subject;
  final String snippet;
  final String? textBody;
  final String? htmlBody;
  final String folder;
  final bool isRead;
  final bool isStarred;
  final bool isDraft;
  final bool hasAttachments;
  final int sizeBytes;

  /// Outbound lifecycle status — mirrors the backend column. 'idle'
  /// for inbound mail; 'sending' / 'sent' / 'failed' / 'rate_limited'
  /// for emails the user has tried to send.
  final String status;
  final String? sendError;
  final DateTime createdAt;

  /// Server-side mutation timestamp. Drives last-write-wins
  /// reconciliation in the local store: a server upsert can only
  /// override the local copy when its updatedAt is strictly newer.
  final DateTime updatedAt;
  final String? mailboxId;
  final List<EmailAttachment> attachments;

  /// Labels attached to this email. Server ships these inline on every
  /// list response so the row renderer never has to fire a per-row
  /// lookup. Empty in search-result rows (Meili doesn't index label
  /// membership reliably).
  final List<EmailLabelRef> labels;

  /// Thread id the email belongs to. Null on pre-threading rows; the
  /// UI treats those as their own single-message thread.
  final String? threadId;

  // Pre-computed once in the constructor — getters used to recompute these
  // on every frame for every row in the list.
  final String senderName;
  final String senderEmail;
  final String senderInitials;
  final Color senderAvatarColor;
  final String preview;

  factory Email.fromJson(Map<String, dynamic> json) {
    return Email(
      id: json['id'] as String,
      fromAddress: (json['fromAddress'] as String?) ?? '',
      toAddresses: _asStringList(json['toAddresses']),
      cc: _asStringList(json['cc']),
      bcc: _asStringList(json['bcc']),
      subject: (json['subject'] as String?) ?? '',
      snippet: (json['snippet'] as String?) ?? '',
      textBody: json['textBody'] as String?,
      htmlBody: json['htmlBody'] as String?,
      folder: (json['folder'] as String?) ?? 'inbox',
      isRead: (json['isRead'] as bool?) ?? false,
      isStarred: (json['isStarred'] as bool?) ?? false,
      isDraft: (json['isDraft'] as bool?) ?? false,
      hasAttachments: (json['hasAttachments'] as bool?) ?? false,
      sizeBytes: (json['sizeBytes'] as num?)?.toInt() ?? 0,
      status: (json['status'] as String?) ?? 'idle',
      sendError: json['sendError'] as String?,
      mailboxId: json['mailboxId'] as String?,
      createdAt: _parseDate(json['createdAt']),
      updatedAt: json['updatedAt'] != null
          ? _parseDate(json['updatedAt'])
          : _parseDate(json['createdAt']),
      attachments: (json['attachments'] as List<dynamic>? ?? const [])
          .map((a) => EmailAttachment.fromJson(a as Map<String, dynamic>))
          .toList(growable: false),
      labels: (json['labels'] as List<dynamic>? ?? const [])
          .map((l) => EmailLabelRef.fromJson(l as Map<String, dynamic>))
          .toList(growable: false),
      threadId: json['threadId'] as String?,
    );
  }

  Email copyWith({
    bool? isRead,
    bool? isStarred,
    String? folder,
    String? status,
    String? sendError,
    DateTime? updatedAt,
  }) => Email(
    id: id,
    fromAddress: fromAddress,
    toAddresses: toAddresses,
    cc: cc,
    bcc: bcc,
    subject: subject,
    snippet: snippet,
    textBody: textBody,
    htmlBody: htmlBody,
    folder: folder ?? this.folder,
    isRead: isRead ?? this.isRead,
    isStarred: isStarred ?? this.isStarred,
    isDraft: isDraft,
    hasAttachments: hasAttachments,
    sizeBytes: sizeBytes,
    status: status ?? this.status,
    sendError: sendError ?? this.sendError,
    createdAt: createdAt,
    updatedAt: updatedAt ?? this.updatedAt,
    mailboxId: mailboxId,
    attachments: attachments,
    labels: labels,
    threadId: threadId,
  );

  /// Merge a fully-loaded body fetched from /emails/:id back into the slim
  /// list row — keeps the cached display fields and just attaches the
  /// expensive payload.
  Email withBody({
    String? textBody,
    String? htmlBody,
    List<EmailAttachment>? attachments,
  }) => Email(
    id: id,
    fromAddress: fromAddress,
    toAddresses: toAddresses,
    cc: cc,
    bcc: bcc,
    subject: subject,
    snippet: snippet,
    textBody: textBody ?? this.textBody,
    htmlBody: htmlBody ?? this.htmlBody,
    folder: folder,
    isRead: isRead,
    isStarred: isStarred,
    isDraft: isDraft,
    hasAttachments: attachments?.isNotEmpty ?? hasAttachments,
    sizeBytes: sizeBytes,
    status: status,
    sendError: sendError,
    createdAt: createdAt,
    updatedAt: updatedAt,
    mailboxId: mailboxId,
    attachments: attachments ?? this.attachments,
    labels: labels,
    threadId: threadId,
  );

  String get timeAgo => _formatTimeAgo(createdAt);

  static String _extractSenderName(String fromAddress) {
    final match = _angleBracketSenderRegex.firstMatch(fromAddress);
    if (match != null) {
      final name = match.group(1)?.replaceAll('"', '').trim() ?? '';
      if (name.isNotEmpty) return name;
      return match.group(2) ?? fromAddress;
    }
    final atIndex = fromAddress.indexOf('@');
    if (atIndex > 0) return fromAddress.substring(0, atIndex);
    return fromAddress;
  }

  static String _extractSenderEmail(String fromAddress) {
    final match = _angleBracketEmailRegex.firstMatch(fromAddress);
    return match?.group(1) ?? fromAddress;
  }

  static String _initialsFor(String name) {
    final parts = name
        .split(_splitDelimRegex)
        .where((p) => p.isNotEmpty)
        .toList();
    if (parts.isEmpty) return '?';
    if (parts.length == 1) return parts.first.substring(0, 1).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  static Color _colorFor(String fromAddress) {
    final hash = fromAddress.codeUnits.fold<int>(0, (a, b) => a + b);
    return _avatarPalette[hash % _avatarPalette.length];
  }

  /// Build the per-row preview string. Prefers the server-provided
  /// `snippet` field (already cleaned and capped), falls back to a local
  /// summary of the text body for legacy responses.
  static String _buildPreview(String snippet, String? textBody) {
    if (snippet.isNotEmpty) {
      return snippet.length <= 140 ? snippet : '${snippet.substring(0, 140)}…';
    }
    final text = textBody ?? '';
    if (text.isEmpty) return '';
    final normalized = text.replaceAll(_whitespaceRegex, ' ').trim();
    if (normalized.length <= 140) return normalized;
    return '${normalized.substring(0, 140)}…';
  }

  static List<String> _asStringList(dynamic raw) {
    if (raw is List) {
      return raw.whereType<String>().toList(growable: false);
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
    this.contentId,
    this.parsedIcs,
    this.rsvpResponse,
  });

  final String id;
  final String filename;
  final String contentType;
  final int sizeBytes;
  final String? contentId;

  /// Present when the server successfully parsed a text/calendar
  /// attachment — lets the UI render title/time/location + working
  /// RSVP buttons instead of the generic placeholder.
  final ParsedIcs? parsedIcs;

  /// Server-persisted last RSVP choice — one of 'accept', 'tentative',
  /// 'decline', or null if the user hasn't responded. Seeds the ICS
  /// card's confirmation pill so it survives navigation.
  final String? rsvpResponse;

  factory EmailAttachment.fromJson(Map<String, dynamic> json) {
    return EmailAttachment(
      id: json['id'] as String,
      filename: (json['filename'] as String?) ?? '',
      contentType: (json['contentType'] as String?) ?? '',
      sizeBytes: (json['sizeBytes'] as int?) ?? 0,
      contentId: json['contentId'] as String?,
      parsedIcs: json['parsedIcs'] is Map<String, dynamic>
          ? ParsedIcs.fromJson(json['parsedIcs'] as Map<String, dynamic>)
          : null,
      rsvpResponse: json['rsvpResponse'] as String?,
    );
  }
}

/// Compact label reference baked into every email list row.
/// Intentionally small — just what the row renderer needs to draw a
/// chip. Full label objects (with mailboxId etc.) come from the
/// labels settings endpoint when the user actually edits them.
class EmailLabelRef {
  const EmailLabelRef({
    required this.id,
    required this.name,
    required this.color,
  });

  final String id;
  final String name;
  final String color;

  factory EmailLabelRef.fromJson(Map<String, dynamic> json) {
    return EmailLabelRef(
      id: (json['id'] as String?) ?? '',
      name: (json['name'] as String?) ?? '',
      color: (json['color'] as String?) ?? '#999999',
    );
  }

  Color get swatch {
    final hex = color.replaceFirst('#', '');
    if (hex.length != 6) return const Color(0xFF999999);
    return Color(int.parse('FF$hex', radix: 16));
  }
}

/// Server-parsed VEVENT fields. Lifted straight from the API response;
/// we don't re-parse the ICS client-side.
class ParsedIcs {
  const ParsedIcs({
    required this.uid,
    this.method,
    this.summary,
    this.description,
    this.location,
    this.startAt,
    this.endAt,
    required this.allDay,
    this.organizerEmail,
    this.organizerName,
    required this.sequence,
  });

  final String uid;
  final String? method;
  final String? summary;
  final String? description;
  final String? location;
  final DateTime? startAt;
  final DateTime? endAt;
  final bool allDay;
  final String? organizerEmail;
  final String? organizerName;
  final int sequence;

  factory ParsedIcs.fromJson(Map<String, dynamic> json) {
    DateTime? parseDt(dynamic v) {
      if (v is String) return DateTime.tryParse(v);
      return null;
    }

    final organizer = json['organizer'];
    return ParsedIcs(
      uid: (json['uid'] as String?) ?? '',
      method: json['method'] as String?,
      summary: json['summary'] as String?,
      description: json['description'] as String?,
      location: json['location'] as String?,
      startAt: parseDt(json['startAt']),
      endAt: parseDt(json['endAt']),
      allDay: (json['allDay'] as bool?) ?? false,
      organizerEmail: organizer is Map<String, dynamic>
          ? organizer['email'] as String?
          : null,
      organizerName: organizer is Map<String, dynamic>
          ? organizer['name'] as String?
          : null,
      sequence: (json['sequence'] as int?) ?? 0,
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
    final raw = (json['data'] as List<dynamic>? ?? const [])
        .map((e) => Email.fromJson(e as Map<String, dynamic>))
        .toList(growable: false);
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
    this.scheduledAt,
    this.inReplyTo,
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

  /// When set, the compose is a schedule-send: the server stores the
  /// row with folder='drafts' + scheduledAt, and the dispatcher sends
  /// it at that instant. `send` must stay true for this path so the
  /// server knows the user intended a send, not a manual draft save.
  final DateTime? scheduledAt;
  final String? inReplyTo;

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
    if (scheduledAt != null)
      'scheduledAt': scheduledAt!.toUtc().toIso8601String(),
    if (inReplyTo != null) 'inReplyTo': inReplyTo,
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
