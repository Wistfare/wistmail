import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/fcm/push_client.dart';
import '../../../../core/network/providers.dart';
import '../../data/auth_remote_data_source.dart';
import '../../data/auth_repository.dart';
import '../../domain/mfa.dart';
import '../../domain/user.dart';

const _sessionCookieName = 'wm_session';

final authRepositoryProvider = FutureProvider<AuthRepository>((ref) async {
  final client = await ref.watch(apiClientProvider.future);
  return AuthRepositoryImpl(AuthRemoteDataSource(client));
});

class AuthState {
  const AuthState({
    this.user,
    this.isLoading = false,
    this.errorMessage,
    this.isRestoring = true,
    this.pendingMfa,
  });

  final User? user;
  final bool isLoading;
  final String? errorMessage;
  final bool isRestoring;

  /// Set after step 1 of login when the server tells us MFA is required.
  /// While non-null, the app should show MfaChallengeScreen instead of
  /// completing the navigation to /inbox.
  final MfaChallenge? pendingMfa;

  bool get isAuthenticated => user != null;
  bool get awaitingMfa => pendingMfa != null;

  AuthState copyWith({
    User? user,
    bool? isLoading,
    String? errorMessage,
    bool? isRestoring,
    MfaChallenge? pendingMfa,
    bool clearError = false,
    bool clearUser = false,
    bool clearPendingMfa = false,
  }) {
    return AuthState(
      user: clearUser ? null : (user ?? this.user),
      isLoading: isLoading ?? this.isLoading,
      errorMessage: clearError ? null : (errorMessage ?? this.errorMessage),
      isRestoring: isRestoring ?? this.isRestoring,
      pendingMfa: clearPendingMfa ? null : (pendingMfa ?? this.pendingMfa),
    );
  }
}

class AuthController extends StateNotifier<AuthState> {
  AuthController(this._ref) : super(const AuthState()) {
    _restore();
  }

  final Ref _ref;

  Future<AuthRepository> get _repo => _ref.read(authRepositoryProvider.future);

  Future<void> _restore() async {
    try {
      // Skip the HTTP validation entirely when there's no session cookie
      // stored locally. This lets the router redirect first-time / signed-out
      // users straight to /auth/sign-in without flashing the inbox skeleton.
      final hasCookie = await _hasSessionCookie();
      if (!hasCookie) {
        state = state.copyWith(isRestoring: false, clearUser: true);
        return;
      }

      final repo = await _repo;
      final user = await repo.restoreSession();
      state = state.copyWith(
        user: user,
        isRestoring: false,
        clearUser: user == null,
      );
      if (user != null) {
        unawaited(_registerPush());
      }
    } catch (_) {
      state = state.copyWith(isRestoring: false);
    }
  }

  Future<bool> _hasSessionCookie() async {
    try {
      final jar = await _ref.read(cookieJarProvider.future);
      final config = _ref.read(appConfigProvider);
      final cookies = await jar.loadForRequest(Uri.parse(config.apiBaseUrl));
      return cookies.any((c) => c.name == _sessionCookieName);
    } catch (_) {
      return false;
    }
  }

  /// Step 1 of login. Returns true if the user is now signed in (no MFA),
  /// false if either an error occurred OR an MFA challenge is now pending
  /// (`state.awaitingMfa` becomes true; caller should navigate to the MFA
  /// challenge screen).
  Future<bool> login({required String email, required String password}) async {
    state = state.copyWith(
      isLoading: true,
      clearError: true,
      clearPendingMfa: true,
    );
    try {
      final repo = await _repo;
      final result = await repo.login(email: email, password: password);
      switch (result) {
        case LoginCompleted(user: final user):
          state = state.copyWith(
            user: user,
            isLoading: false,
            clearPendingMfa: true,
          );
          unawaited(_registerPush());
          return true;
        case LoginNeedsMfa(challenge: final challenge):
          state = state.copyWith(
            isLoading: false,
            pendingMfa: challenge,
          );
          return false;
      }
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        errorMessage: _formatError(e),
      );
      return false;
    }
  }

  /// Step 2 of login — submit a TOTP / backup / email code against the
  /// current pending challenge. Clears pendingMfa on success and signs
  /// the user in.
  Future<bool> verifyMfa(String code) async {
    final pending = state.pendingMfa;
    if (pending == null) {
      state = state.copyWith(errorMessage: 'No pending sign-in to verify.');
      return false;
    }
    state = state.copyWith(isLoading: true, clearError: true);
    try {
      final repo = await _repo;
      final user = await repo.verifyLogin(
        pendingToken: pending.pendingToken,
        code: code,
      );
      state = state.copyWith(
        user: user,
        isLoading: false,
        clearPendingMfa: true,
      );
      unawaited(_registerPush());
      return true;
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        errorMessage: _formatError(e),
      );
      return false;
    }
  }

  /// Ask the API to dispatch a fresh email-MFA code to the user's verified
  /// backup address. Used by the "Use email instead" flow.
  Future<bool> requestMfaEmailCode() async {
    final pending = state.pendingMfa;
    if (pending == null) return false;
    try {
      final repo = await _repo;
      await repo.requestLoginEmailCode(pending.pendingToken);
      return true;
    } catch (e) {
      state = state.copyWith(errorMessage: _formatError(e));
      return false;
    }
  }

  /// Drop the in-progress MFA challenge — used when the user backs out of
  /// the MFA screen to retype the password.
  void cancelMfa() {
    state = state.copyWith(clearPendingMfa: true, clearError: true);
  }

  /// Re-fetch the current user from /auth/session so flag changes (e.g.
  /// mfaSetupComplete after enrolling) propagate to the UI.
  Future<void> refreshUser() async {
    try {
      final repo = await _repo;
      final user = await repo.restoreSession();
      if (user != null) {
        state = state.copyWith(user: user);
      }
    } catch (_) {}
  }

  Future<void> logout() async {
    try {
      final push = await _ref.read(pushClientProvider.future);
      await push.unregister();
    } catch (_) {}
    try {
      final repo = await _repo;
      await repo.logout();
    } catch (_) {}
    state = const AuthState(isRestoring: false);
  }

  Future<bool> deleteAccount({required String password}) async {
    try {
      final push = await _ref.read(pushClientProvider.future);
      await push.unregister();
    } catch (_) {}
    try {
      final repo = await _repo;
      await repo.deleteAccount(password: password);
      state = const AuthState(isRestoring: false);
      return true;
    } catch (e) {
      state = state.copyWith(errorMessage: _formatError(e));
      return false;
    }
  }

  Future<void> _registerPush() async {
    try {
      final push = await _ref.read(pushClientProvider.future);
      await push.registerForCurrentUser();
    } catch (_) {
      // Push is opt-in; failures shouldn't block auth.
    }
  }

  String _formatError(Object error) {
    final msg = error.toString();
    final match = RegExp(r'ApiException\([^)]*\):\s*(.*)$').firstMatch(msg);
    return match != null ? match.group(1)! : 'Sign in failed. Please try again.';
  }
}

final authControllerProvider = StateNotifierProvider<AuthController, AuthState>(
  (ref) => AuthController(ref),
);
