class User {
  const User({
    required this.id,
    required this.name,
    required this.email,
    this.avatarUrl,
    this.setupComplete = false,
    this.setupStep,
  });

  final String id;
  final String name;
  final String email;
  final String? avatarUrl;
  final bool setupComplete;
  final String? setupStep;

  factory User.fromJson(Map<String, dynamic> json) {
    return User(
      id: json['id'] as String,
      name: json['name'] as String,
      email: json['email'] as String,
      avatarUrl: json['avatarUrl'] as String?,
      setupComplete: (json['setupComplete'] as bool?) ?? false,
      setupStep: json['setupStep'] as String?,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'email': email,
        'avatarUrl': avatarUrl,
        'setupComplete': setupComplete,
        'setupStep': setupStep,
      };

  String get initials {
    final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
    if (parts.isEmpty) {
      return email.isNotEmpty ? email[0].toUpperCase() : '?';
    }
    if (parts.length == 1) return parts[0].substring(0, 1).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
}
