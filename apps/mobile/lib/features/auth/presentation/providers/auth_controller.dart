import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/fcm/push_client.dart';
import '../../../../core/network/providers.dart';
import '../../data/auth_remote_data_source.dart';
import '../../data/auth_repository.dart';
import '../../domain/user.dart';

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
  });

  final User? user;
  final bool isLoading;
  final String? errorMessage;
  final bool isRestoring;

  bool get isAuthenticated => user != null;

  AuthState copyWith({
    User? user,
    bool? isLoading,
    String? errorMessage,
    bool? isRestoring,
    bool clearError = false,
    bool clearUser = false,
  }) {
    return AuthState(
      user: clearUser ? null : (user ?? this.user),
      isLoading: isLoading ?? this.isLoading,
      errorMessage: clearError ? null : (errorMessage ?? this.errorMessage),
      isRestoring: isRestoring ?? this.isRestoring,
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
      final repo = await _repo;
      final user = await repo.restoreSession();
      state = state.copyWith(user: user, isRestoring: false, clearUser: user == null);
      if (user != null) {
        unawaited(_registerPush());
      }
    } catch (_) {
      state = state.copyWith(isRestoring: false);
    }
  }

  Future<bool> login({required String email, required String password}) async {
    state = state.copyWith(isLoading: true, clearError: true);
    try {
      final repo = await _repo;
      final user = await repo.login(email: email, password: password);
      state = state.copyWith(user: user, isLoading: false);
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
