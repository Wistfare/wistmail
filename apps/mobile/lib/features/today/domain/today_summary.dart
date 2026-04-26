// Domain entities for the Today screen — mirrors the `/api/v1/today`
// response shape. Fields are nullable where the backend returns null
// (no upcoming meeting, empty activity feed, etc).

class TodayNextUp {
  const TodayNextUp({
    required this.eventId,
    required this.title,
    required this.startAt,
    required this.endAt,
    required this.attendees,
    this.meetingLink,
  });

  final String eventId;
  final String title;
  final DateTime startAt;
  final DateTime endAt;
  final List<String> attendees;
  final String? meetingLink;

  factory TodayNextUp.fromJson(Map<String, dynamic> json) {
    return TodayNextUp(
      eventId: json['id'] as String,
      title: (json['title'] as String?) ?? '(no title)',
      startAt: DateTime.parse(json['startAt'] as String),
      endAt: DateTime.parse(json['endAt'] as String),
      attendees: ((json['attendees'] as List?) ?? const [])
          .whereType<String>()
          .toList(growable: false),
      meetingLink: json['meetingLink'] as String?,
    );
  }

  /// Minutes from now until start. Negative when already started.
  int get minutesUntilStart =>
      startAt.difference(DateTime.now()).inMinutes;
}

class TodayNeedsReplyItem {
  const TodayNeedsReplyItem({
    required this.emailId,
    required this.subject,
    required this.fromAddress,
    this.fromName,
    required this.createdAt,
    this.reason,
  });

  final String emailId;
  final String subject;
  final String fromAddress;
  /// Display name from the From header, when the sender's MTA set
  /// one. Renderer falls back to the local-part of fromAddress if null.
  final String? fromName;
  final DateTime createdAt;
  final String? reason;

  /// Renderer-friendly display: prefer fromName, fall back to the
  /// local-part of the address (everything before the `@`).
  String get displayName {
    final n = fromName?.trim();
    if (n != null && n.isNotEmpty) return n;
    final at = fromAddress.indexOf('@');
    return at > 0 ? fromAddress.substring(0, at) : fromAddress;
  }

  factory TodayNeedsReplyItem.fromJson(Map<String, dynamic> json) {
    return TodayNeedsReplyItem(
      emailId: json['id'] as String,
      subject: (json['subject'] as String?) ?? '(no subject)',
      fromAddress: json['fromAddress'] as String,
      fromName: json['fromName'] as String?,
      createdAt: DateTime.parse(json['createdAt'] as String),
      reason: json['needsReplyReason'] as String?,
    );
  }
}

class TodayScheduleEvent {
  const TodayScheduleEvent({
    required this.eventId,
    required this.title,
    required this.startAt,
    required this.endAt,
    this.location,
    this.attendees = const [],
    this.meetingLink,
  });

  final String eventId;
  final String title;
  final DateTime startAt;
  final DateTime endAt;
  final String? location;
  final List<String> attendees;
  final String? meetingLink;

  factory TodayScheduleEvent.fromJson(Map<String, dynamic> json) {
    return TodayScheduleEvent(
      eventId: json['id'] as String,
      title: (json['title'] as String?) ?? '(no title)',
      startAt: DateTime.parse(json['startAt'] as String),
      endAt: DateTime.parse(json['endAt'] as String),
      location: json['location'] as String?,
      attendees: ((json['attendees'] as List?) ?? const [])
          .whereType<String>()
          .toList(growable: false),
      meetingLink: json['meetingLink'] as String?,
    );
  }
}

class TodayActivityItem {
  const TodayActivityItem({
    required this.projectId,
    required this.projectName,
    required this.taskId,
    required this.taskTitle,
    required this.status,
    required this.updatedAt,
  });

  final String projectId;
  final String projectName;
  final String taskId;
  final String taskTitle;
  final String status; // todo | in_progress | done
  final DateTime updatedAt;

  factory TodayActivityItem.fromJson(Map<String, dynamic> json) {
    return TodayActivityItem(
      projectId: json['projectId'] as String,
      projectName: (json['projectName'] as String?) ?? '',
      taskId: json['taskId'] as String,
      taskTitle: (json['taskTitle'] as String?) ?? '',
      status: (json['status'] as String?) ?? 'todo',
      updatedAt: DateTime.parse(json['updatedAt'] as String),
    );
  }
}

/// AI-generated morning briefing. Null when the worker hasn't produced
/// one yet (or the user is brand new). The Today screen falls back to
/// the component sections rather than blocking on the digest.
class TodayDigest {
  const TodayDigest({
    required this.briefing,
    this.priorities = const [],
    this.focusBlocks = const [],
  });

  final String briefing;
  final List<TodayPriority> priorities;
  final List<TodayFocusBlock> focusBlocks;

  factory TodayDigest.fromJson(Map<String, dynamic> json) {
    return TodayDigest(
      briefing: (json['briefing'] as String?) ?? '',
      priorities: ((json['priorities'] as List?) ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(TodayPriority.fromJson)
          .toList(growable: false),
      focusBlocks: ((json['focusBlocks'] as List?) ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(TodayFocusBlock.fromJson)
          .toList(growable: false),
    );
  }
}

class TodayPriority {
  const TodayPriority({required this.kind, required this.id, required this.reason});
  final String kind; // email | task | event
  final String id;
  final String reason;

  factory TodayPriority.fromJson(Map<String, dynamic> json) => TodayPriority(
        kind: (json['kind'] as String?) ?? 'email',
        id: (json['id'] as String?) ?? '',
        reason: (json['reason'] as String?) ?? '',
      );
}

class TodayFocusBlock {
  const TodayFocusBlock({required this.startAt, required this.endAt, required this.label});
  final String startAt;
  final String endAt;
  final String label;

  factory TodayFocusBlock.fromJson(Map<String, dynamic> json) => TodayFocusBlock(
        startAt: (json['startAt'] as String?) ?? '',
        endAt: (json['endAt'] as String?) ?? '',
        label: (json['label'] as String?) ?? '',
      );
}

class TodaySummary {
  const TodaySummary({
    this.nextUp,
    this.needsReply = const [],
    this.schedule = const [],
    this.recentActivity = const [],
    this.digest,
  });

  final TodayNextUp? nextUp;
  final List<TodayNeedsReplyItem> needsReply;
  final List<TodayScheduleEvent> schedule;
  final List<TodayActivityItem> recentActivity;
  final TodayDigest? digest;

  factory TodaySummary.fromJson(Map<String, dynamic> json) {
    return TodaySummary(
      nextUp: json['nextUp'] == null
          ? null
          : TodayNextUp.fromJson(json['nextUp'] as Map<String, dynamic>),
      needsReply: ((json['needsReply'] as List?) ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(TodayNeedsReplyItem.fromJson)
          .toList(growable: false),
      schedule: ((json['schedule'] as List?) ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(TodayScheduleEvent.fromJson)
          .toList(growable: false),
      recentActivity: ((json['recentActivity'] as List?) ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(TodayActivityItem.fromJson)
          .toList(growable: false),
      digest: json['digest'] == null
          ? null
          : TodayDigest.fromJson(json['digest'] as Map<String, dynamic>),
    );
  }

  bool get isEmpty =>
      nextUp == null &&
      needsReply.isEmpty &&
      schedule.isEmpty &&
      recentActivity.isEmpty &&
      digest == null;
}
