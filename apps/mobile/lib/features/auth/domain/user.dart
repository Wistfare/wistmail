class User {
  const User({
    required this.id,
    required this.name,
    required this.email,
    this.avatarUrl,
    this.setupComplete = false,
    this.setupStep,
    this.mfaRequired = true,
    this.mfaSetupComplete = false,
  });

  final String id;
  final String name;
  final String email;
  final String? avatarUrl;
  final bool setupComplete;
  final String? setupStep;
  final bool mfaRequired;
  final bool mfaSetupComplete;

  /// True when the app should nudge the user to enroll in MFA.
  bool get needsMfaSetup => mfaRequired && !mfaSetupComplete;

  factory User.fromJson(Map<String, dynamic> json) {
    return User(
      id: json['id'] as String,
      name: json['name'] as String,
      email: json['email'] as String,
      avatarUrl: json['avatarUrl'] as String?,
      setupComplete: (json['setupComplete'] as bool?) ?? false,
      setupStep: json['setupStep'] as String?,
      mfaRequired: (json['mfaRequired'] as bool?) ?? true,
      mfaSetupComplete: (json['mfaSetupComplete'] as bool?) ?? false,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'email': email,
        'avatarUrl': avatarUrl,
        'setupComplete': setupComplete,
        'setupStep': setupStep,
        'mfaRequired': mfaRequired,
        'mfaSetupComplete': mfaSetupComplete,
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
