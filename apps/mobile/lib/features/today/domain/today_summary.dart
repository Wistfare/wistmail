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
    required this.createdAt,
    this.reason,
  });

  final String emailId;
  final String subject;
  final String fromAddress;
  final DateTime createdAt;
  final String? reason;

  factory TodayNeedsReplyItem.fromJson(Map<String, dynamic> json) {
    return TodayNeedsReplyItem(
      emailId: json['id'] as String,
      subject: (json['subject'] as String?) ?? '(no subject)',
      fromAddress: json['fromAddress'] as String,
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

class TodaySummary {
  const TodaySummary({
    this.nextUp,
    this.needsReply = const [],
    this.schedule = const [],
    this.recentActivity = const [],
  });

  final TodayNextUp? nextUp;
  final List<TodayNeedsReplyItem> needsReply;
  final List<TodayScheduleEvent> schedule;
  final List<TodayActivityItem> recentActivity;

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
    );
  }

  bool get isEmpty =>
      nextUp == null &&
      needsReply.isEmpty &&
      schedule.isEmpty &&
      recentActivity.isEmpty;
}
