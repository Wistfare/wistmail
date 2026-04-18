import 'dart:async';
import 'dart:io' show Platform;
import 'package:dio/dio.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../network/api_client.dart';
import '../network/providers.dart';

/// Handles the FCM lifecycle on the device:
///   1. Ask the user for notification permission.
///   2. Fetch the current FCM token and register it with the backend.
///   3. Listen for token refreshes and re-register.
///   4. On logout, unregister the token and stop listeners.
///
/// The client is tolerant: if Firebase is unavailable (e.g. web in tests,
/// emulators without Google Play Services), register/unregister become no-ops.
class PushClient {
  PushClient({
    required this.apiClient,
    FirebaseMessaging? messaging,
  }) : _messaging = messaging ?? _tryGetMessaging();

  final ApiClient apiClient;
  final FirebaseMessaging? _messaging;
  StreamSubscription<String>? _tokenSub;
  String? _currentToken;

  /// Request notification permission, fetch the token, and register it with
  /// the backend. Safe to call repeatedly (idempotent server-side).
  Future<void> registerForCurrentUser() async {
    final messaging = _messaging;
    if (messaging == null) return;

    try {
      await messaging.requestPermission();

      final token = await messaging.getToken();
      if (token != null && token.isNotEmpty) {
        _currentToken = token;
        await _postToken(token);
      }

      _tokenSub?.cancel();
      _tokenSub = messaging.onTokenRefresh.listen((newToken) async {
        _currentToken = newToken;
        await _postToken(newToken);
      });
    } catch (err) {
      // Don't block login if push fails to initialize.
      // ignore: avoid_print
      print('[push] init skipped: $err');
    }
  }

  /// Delete the current token from the backend and stop refresh listeners.
  Future<void> unregister() async {
    final token = _currentToken;
    await _tokenSub?.cancel();
    _tokenSub = null;
    _currentToken = null;
    if (token == null) return;
    try {
      await apiClient.dio.delete<Map<String, dynamic>>(
        '/api/v1/user/device-tokens',
        data: {'token': token},
      );
    } catch (_) {
      // Best-effort; don't block logout.
    }
  }

  Future<void> _postToken(String token) async {
    try {
      await apiClient.dio.post<Map<String, dynamic>>(
        '/api/v1/user/device-tokens',
        data: {
          'token': token,
          'platform': _platformLabel(),
        },
      );
    } on DioException {
      // Retry on next token refresh or login.
    }
  }

  String _platformLabel() {
    if (Platform.isAndroid) return 'android';
    if (Platform.isIOS) return 'ios';
    return 'web';
  }

  static FirebaseMessaging? _tryGetMessaging() {
    try {
      return FirebaseMessaging.instance;
    } catch (_) {
      return null;
    }
  }
}

final pushClientProvider = FutureProvider<PushClient>((ref) async {
  final apiClient = await ref.watch(apiClientProvider.future);
  return PushClient(apiClient: apiClient);
});
