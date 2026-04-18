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
  });

  final String id;
  final String name;
  final String? description;
  final String status; // active | completed | archived
  final int progress; // 0-100
  final List<String> memberUserIds;
  final DateTime? dueDate;
  final DateTime updatedAt;

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
    );
  }

  bool get isActive => status == 'active';
  bool get isCompleted => status == 'completed';
}
