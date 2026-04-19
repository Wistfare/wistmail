import 'package:dio/dio.dart';
import '../../../core/network/api_client.dart';
import '../domain/mfa.dart';
import '../domain/user.dart';

class AuthRemoteDataSource {
  AuthRemoteDataSource(this._client);
  final ApiClient _client;

  /// Step 1 of login. Returns either the User (no MFA) or an MfaChallenge.
  Future<LoginResult> login({
    required String email,
    required String password,
  }) async {
    final response = await _client.dio.post<Map<String, dynamic>>(
      '/api/v1/auth/login',
      data: {'email': email, 'password': password},
    );
    final data = response.data!;
    if (data['mfaRequired'] == true) {
      return LoginNeedsMfa(MfaChallenge.fromJson(data));
    }
    return LoginCompleted(User.fromJson(data['user'] as Map<String, dynamic>));
  }

  /// Step 2 of login. Returns the signed-in User.
  Future<User> verifyLogin({
    required String pendingToken,
    required String code,
  }) async {
    final response = await _client.dio.post<Map<String, dynamic>>(
      '/api/v1/auth/login/verify',
      data: {'pendingToken': pendingToken, 'code': code},
    );
    return User.fromJson(response.data!['user'] as Map<String, dynamic>);
  }

  /// Optional helper for email-as-MFA: ask the API to dispatch a fresh
  /// 6-digit code to the user's verified backup address.
  Future<void> requestLoginEmailCode(String pendingToken) async {
    await _client.dio.post<Map<String, dynamic>>(
      '/api/v1/auth/login/email-code',
      data: {'pendingToken': pendingToken},
    );
  }

  Future<User?> getSession() async {
    try {
      final response = await _client.dio.get<Map<String, dynamic>>(
        '/api/v1/auth/session',
      );
      final user = response.data?['user'];
      if (user == null) return null;
      return User.fromJson(user as Map<String, dynamic>);
    } on DioException {
      return null;
    }
  }

  Future<void> logout() async {
    try {
      await _client.dio.post<Map<String, dynamic>>('/api/v1/auth/logout');
    } on DioException {
      // ignore: server errors still clear local state
    }
    await _client.clearCookies();
  }

  Future<void> deleteAccount({required String password}) async {
    await _client.dio.post<Map<String, dynamic>>(
      '/api/v1/user/delete-account',
      data: {'password': password, 'confirmation': 'DELETE'},
    );
    await _client.clearCookies();
  }

  // ── MFA enrollment ─────────────────────────────────────────────────────

  Future<MfaMethodsListing> listMfaMethods() async {
    final response = await _client.dio.get<Map<String, dynamic>>(
      '/api/v1/mfa/methods',
    );
    return MfaMethodsListing.fromJson(response.data!);
  }

  Future<void> deleteMfaMethod(String methodId) async {
    await _client.dio.delete<Map<String, dynamic>>(
      '/api/v1/mfa/methods/$methodId',
    );
  }

  Future<TotpSetupChallenge> beginTotpSetup() async {
    final response = await _client.dio.post<Map<String, dynamic>>(
      '/api/v1/mfa/totp/setup',
    );
    final data = response.data!;
    return TotpSetupChallenge(
      methodId: data['methodId'] as String,
      secret: data['secret'] as String,
      otpauthUrl: data['otpauthUrl'] as String,
    );
  }

  Future<MfaVerifySuccess> verifyTotpSetup({
    required String methodId,
    required String code,
  }) async {
    final response = await _client.dio.post<Map<String, dynamic>>(
      '/api/v1/mfa/totp/verify',
      data: {'methodId': methodId, 'code': code},
    );
    final codes = response.data?['backupCodes'];
    return MfaVerifySuccess(
      backupCodes: codes == null
          ? null
          : (codes as List<dynamic>).map((e) => e as String).toList(),
    );
  }

  Future<String> beginEmailSetup(String address) async {
    final response = await _client.dio.post<Map<String, dynamic>>(
      '/api/v1/mfa/email/setup',
      data: {'address': address},
    );
    return response.data!['methodId'] as String;
  }

  Future<MfaVerifySuccess> verifyEmailSetup({
    required String methodId,
    required String code,
  }) async {
    final response = await _client.dio.post<Map<String, dynamic>>(
      '/api/v1/mfa/email/verify',
      data: {'methodId': methodId, 'code': code},
    );
    final codes = response.data?['backupCodes'];
    return MfaVerifySuccess(
      backupCodes: codes == null
          ? null
          : (codes as List<dynamic>).map((e) => e as String).toList(),
    );
  }

  Future<List<String>> regenerateBackupCodes() async {
    final response = await _client.dio.post<Map<String, dynamic>>(
      '/api/v1/mfa/backup-codes/regenerate',
    );
    return (response.data!['codes'] as List<dynamic>)
        .map((e) => e as String)
        .toList();
  }
}
