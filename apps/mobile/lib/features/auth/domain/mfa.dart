/// Returned by /auth/login when the user has verified MFA configured.
/// Holds the short-lived pending token plus the list of factor types the
/// caller can present to the user (e.g. "totp", "email"). The mobile app
/// uses these to render the right verification screen.
class MfaChallenge {
  const MfaChallenge({required this.pendingToken, required this.methods});

  final String pendingToken;
  final List<MfaMethodSummary> methods;

  bool get hasTotp => methods.any((m) => m.type == 'totp');
  bool get hasEmail => methods.any((m) => m.type == 'email');

  factory MfaChallenge.fromJson(Map<String, dynamic> json) {
    final list = (json['methods'] as List<dynamic>? ?? [])
        .map((m) => MfaMethodSummary.fromJson(m as Map<String, dynamic>))
        .toList();
    return MfaChallenge(
      pendingToken: json['pendingToken'] as String,
      methods: list,
    );
  }
}

class MfaMethodSummary {
  const MfaMethodSummary({required this.type, this.label});
  final String type; // 'totp' | 'email'
  final String? label;

  factory MfaMethodSummary.fromJson(Map<String, dynamic> json) {
    return MfaMethodSummary(
      type: json['type'] as String,
      label: json['label'] as String?,
    );
  }
}

/// Discriminated result of step 1 of the login flow. Either we got a
/// session immediately (no MFA), OR we need the user to complete MFA.
sealed class LoginResult {
  const LoginResult();
}

class LoginCompleted extends LoginResult {
  const LoginCompleted(this.user);
  final dynamic user; // User — kept dynamic to avoid circular import here
}

class LoginNeedsMfa extends LoginResult {
  const LoginNeedsMfa(this.challenge);
  final MfaChallenge challenge;
}

/// One MFA factor as listed by /api/v1/mfa/methods.
class MfaMethodDetail {
  const MfaMethodDetail({
    required this.id,
    required this.type,
    required this.verified,
    this.label,
    this.lastUsedAt,
    required this.createdAt,
  });

  final String id;
  final String type;
  final bool verified;
  final String? label;
  final DateTime? lastUsedAt;
  final DateTime createdAt;

  factory MfaMethodDetail.fromJson(Map<String, dynamic> json) {
    return MfaMethodDetail(
      id: json['id'] as String,
      type: json['type'] as String,
      verified: json['verified'] as bool,
      label: json['label'] as String?,
      lastUsedAt: json['lastUsedAt'] == null
          ? null
          : DateTime.parse(json['lastUsedAt'] as String),
      createdAt: DateTime.parse(json['createdAt'] as String),
    );
  }
}

class MfaMethodsListing {
  const MfaMethodsListing({
    required this.methods,
    required this.backupTotal,
    required this.backupRemaining,
  });

  final List<MfaMethodDetail> methods;
  final int backupTotal;
  final int backupRemaining;

  bool get hasBackupCodes => backupTotal > 0;

  factory MfaMethodsListing.fromJson(Map<String, dynamic> json) {
    final m = (json['methods'] as List<dynamic>? ?? [])
        .map((e) => MfaMethodDetail.fromJson(e as Map<String, dynamic>))
        .toList();
    final bc = json['backupCodes'] as Map<String, dynamic>? ?? const {};
    return MfaMethodsListing(
      methods: m,
      backupTotal: (bc['total'] as int?) ?? 0,
      backupRemaining: (bc['remaining'] as int?) ?? 0,
    );
  }
}

/// Result of POST /mfa/totp/setup
class TotpSetupChallenge {
  const TotpSetupChallenge({
    required this.methodId,
    required this.secret,
    required this.otpauthUrl,
  });
  final String methodId;
  final String secret;
  final String otpauthUrl;
}

/// Result of POST /mfa/totp/verify or /mfa/email/verify on the FIRST verify
/// (subsequent verifies return null backupCodes).
class MfaVerifySuccess {
  const MfaVerifySuccess({this.backupCodes});
  final List<String>? backupCodes;
}
