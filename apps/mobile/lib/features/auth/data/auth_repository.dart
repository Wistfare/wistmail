import '../domain/mfa.dart';
import '../domain/user.dart';
import 'auth_remote_data_source.dart';

abstract class AuthRepository {
  /// Step 1 of login. Returns either the authenticated User or a pending
  /// MFA challenge that must be completed via [verifyLogin].
  Future<LoginResult> login({required String email, required String password});

  Future<User> verifyLogin({required String pendingToken, required String code});
  Future<void> requestLoginEmailCode(String pendingToken);

  Future<User?> restoreSession();
  Future<void> logout();
  Future<void> deleteAccount({required String password});

  // Password reset (forgot-password flow)
  Future<void> requestPasswordReset(String email);
  Future<ResetPasswordResult> submitPasswordReset({
    required String token,
    required String newPassword,
    String? mfaCode,
  });
  Future<void> requestResetEmailCode(String token);

  // MFA enrollment
  Future<MfaMethodsListing> listMfaMethods();
  Future<void> deleteMfaMethod(String methodId);
  Future<TotpSetupChallenge> beginTotpSetup();
  Future<MfaVerifySuccess> verifyTotpSetup({required String methodId, required String code});
  Future<String> beginEmailSetup(String address);
  Future<MfaVerifySuccess> verifyEmailSetup({required String methodId, required String code});
  Future<List<String>> regenerateBackupCodes();
}

class AuthRepositoryImpl implements AuthRepository {
  AuthRepositoryImpl(this._remote);
  final AuthRemoteDataSource _remote;

  @override
  Future<LoginResult> login({required String email, required String password}) {
    return _remote.login(email: email, password: password);
  }

  @override
  Future<User> verifyLogin({required String pendingToken, required String code}) {
    return _remote.verifyLogin(pendingToken: pendingToken, code: code);
  }

  @override
  Future<void> requestLoginEmailCode(String pendingToken) {
    return _remote.requestLoginEmailCode(pendingToken);
  }

  @override
  Future<User?> restoreSession() => _remote.getSession();

  @override
  Future<void> logout() => _remote.logout();

  @override
  Future<void> deleteAccount({required String password}) =>
      _remote.deleteAccount(password: password);

  @override
  Future<void> requestPasswordReset(String email) =>
      _remote.requestPasswordReset(email);

  @override
  Future<ResetPasswordResult> submitPasswordReset({
    required String token,
    required String newPassword,
    String? mfaCode,
  }) =>
      _remote.submitPasswordReset(
        token: token,
        newPassword: newPassword,
        mfaCode: mfaCode,
      );

  @override
  Future<void> requestResetEmailCode(String token) =>
      _remote.requestResetEmailCode(token);

  @override
  Future<MfaMethodsListing> listMfaMethods() => _remote.listMfaMethods();

  @override
  Future<void> deleteMfaMethod(String methodId) => _remote.deleteMfaMethod(methodId);

  @override
  Future<TotpSetupChallenge> beginTotpSetup() => _remote.beginTotpSetup();

  @override
  Future<MfaVerifySuccess> verifyTotpSetup({
    required String methodId,
    required String code,
  }) =>
      _remote.verifyTotpSetup(methodId: methodId, code: code);

  @override
  Future<String> beginEmailSetup(String address) =>
      _remote.beginEmailSetup(address);

  @override
  Future<MfaVerifySuccess> verifyEmailSetup({
    required String methodId,
    required String code,
  }) =>
      _remote.verifyEmailSetup(methodId: methodId, code: code);

  @override
  Future<List<String>> regenerateBackupCodes() => _remote.regenerateBackupCodes();
}
