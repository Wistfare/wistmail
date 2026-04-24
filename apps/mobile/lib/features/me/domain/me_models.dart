// Domain models for the Me screen.
//
// MeStats comes from GET /user/me/stats; MePreferences from
// GET /user/preferences; MeConnectedAccount from GET /user/connected-accounts.
// Each shape matches the backend exactly so we don't have to remap in the
// repository.

class MeStats {
  const MeStats({
    required this.inboxUnread,
    required this.eventsToday,
    required this.tasksOpen,
  });

  final int inboxUnread;
  final int eventsToday;
  final int tasksOpen;

  factory MeStats.fromJson(Map<String, dynamic> json) => MeStats(
        inboxUnread: (json['inboxUnread'] as num?)?.toInt() ?? 0,
        eventsToday: (json['eventsToday'] as num?)?.toInt() ?? 0,
        tasksOpen: (json['tasksOpen'] as num?)?.toInt() ?? 0,
      );

  static const empty = MeStats(inboxUnread: 0, eventsToday: 0, tasksOpen: 0);
}

class MeNotificationPrefs {
  const MeNotificationPrefs({
    this.mail = true,
    this.chat = true,
    this.calendar = true,
  });

  final bool mail;
  final bool chat;
  final bool calendar;

  factory MeNotificationPrefs.fromJson(Map<String, dynamic> json) =>
      MeNotificationPrefs(
        mail: json['mail'] as bool? ?? true,
        chat: json['chat'] as bool? ?? true,
        calendar: json['calendar'] as bool? ?? true,
      );

  Map<String, dynamic> toJson() =>
      {'mail': mail, 'chat': chat, 'calendar': calendar};

  MeNotificationPrefs copyWith({bool? mail, bool? chat, bool? calendar}) =>
      MeNotificationPrefs(
        mail: mail ?? this.mail,
        chat: chat ?? this.chat,
        calendar: calendar ?? this.calendar,
      );
}

class MePreferences {
  const MePreferences({
    required this.focusModeEnabled,
    this.focusModeUntil,
    this.notificationPrefs = const MeNotificationPrefs(),
  });

  final bool focusModeEnabled;
  final DateTime? focusModeUntil;
  final MeNotificationPrefs notificationPrefs;

  factory MePreferences.fromJson(Map<String, dynamic> json) => MePreferences(
        focusModeEnabled: json['focusModeEnabled'] as bool? ?? false,
        focusModeUntil: json['focusModeUntil'] == null
            ? null
            : DateTime.parse(json['focusModeUntil'] as String),
        notificationPrefs: MeNotificationPrefs.fromJson(
          (json['notificationPrefs'] as Map?)?.cast<String, dynamic>() ?? const {},
        ),
      );

  static const empty = MePreferences(focusModeEnabled: false);
}

class MeConnectedAccount {
  const MeConnectedAccount({
    required this.id,
    required this.kind,
    required this.label,
    required this.address,
  });

  final String id;
  final String kind;
  final String label;
  final String address;

  factory MeConnectedAccount.fromJson(Map<String, dynamic> json) =>
      MeConnectedAccount(
        id: json['id'] as String,
        kind: json['kind'] as String? ?? 'wistmail',
        label: json['label'] as String? ?? '',
        address: json['address'] as String? ?? '',
      );
}
