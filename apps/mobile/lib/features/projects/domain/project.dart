class Project {
  const Project({
    required this.id,
    required this.name,
    this.description,
    required this.status,
    required this.progress,
    this.memberUserIds = const [],
    this.dueDate,
    required this.updatedAt,
    this.taskTotal = 0,
    this.taskDone = 0,
  });

  final String id;
  final String name;
  final String? description;
  final String status; // active | completed | archived
  final int progress; // 0-100
  final List<String> memberUserIds;
  final DateTime? dueDate;
  final DateTime updatedAt;
  // Aggregated task counts from the server. Drives the progress bar
  // + "N tasks · M people" subtitle on the Work screen.
  final int taskTotal;
  final int taskDone;

  factory Project.fromJson(Map<String, dynamic> json) {
    return Project(
      id: json['id'] as String,
      name: (json['name'] as String?) ?? '',
      description: json['description'] as String?,
      status: (json['status'] as String?) ?? 'active',
      progress: (json['progress'] as num?)?.toInt() ?? 0,
      memberUserIds: (json['memberUserIds'] as List<dynamic>? ?? const [])
          .whereType<String>()
          .toList(),
      dueDate: json['dueDate'] == null
          ? null
          : DateTime.parse(json['dueDate'] as String).toLocal(),
      updatedAt: DateTime.parse(json['updatedAt'] as String).toLocal(),
      taskTotal: (json['taskTotal'] as num?)?.toInt() ?? 0,
      taskDone: (json['taskDone'] as num?)?.toInt() ?? 0,
    );
  }

  bool get isActive => status == 'active';
  bool get isCompleted => status == 'completed';
}

/// Lightweight "Recent docs" row — stub model matching the server
/// `/projects/docs/recent` response.
class RecentDoc {
  const RecentDoc({
    required this.id,
    required this.title,
    this.icon,
    this.projectId,
    this.projectName,
    required this.updatedAt,
  });

  final String id;
  final String title;
  final String? icon;
  final String? projectId;
  final String? projectName;
  final DateTime updatedAt;

  factory RecentDoc.fromJson(Map<String, dynamic> json) => RecentDoc(
        id: json['id'] as String,
        title: (json['title'] as String?) ?? '',
        icon: json['icon'] as String?,
        projectId: json['projectId'] as String?,
        projectName: json['projectName'] as String?,
        updatedAt: DateTime.parse(json['updatedAt'] as String).toLocal(),
      );
}
