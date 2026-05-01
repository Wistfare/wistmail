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
///   4. Forward foreground data messages to a public stream so feature
///      providers can invalidate their queries without polling.
///   5. On logout, unregister the token and stop listeners.
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
  StreamSubscription<RemoteMessage>? _msgSub;
  final StreamController<Map<String, String>> _foregroundDataCtrl =
      StreamController<Map<String, String>>.broadcast();
  String? _currentToken;

  /// Foreground FCM data-message stream. Each event is the message's
  /// `data` map (string-to-string). Feature providers subscribe and
  /// invalidate their queries when the event's `type` matches.
  ///
  /// Background messages still flow through the native service that
  /// builds the system notification; those don't appear here because
  /// the user isn't in the app.
  Stream<Map<String, String>> get foregroundData =>
      _foregroundDataCtrl.stream;

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

      // Foreground data-message bridge. The native FCM service handles
      // notification rendering regardless; this listener exists so the
      // open screen can react to events like `email.new.update` (drops
      // suggestions polling), `email.meeting.created`, etc.
      _msgSub?.cancel();
      _msgSub = FirebaseMessaging.onMessage.listen((msg) {
        if (msg.data.isEmpty) return;
        _foregroundDataCtrl.add(Map<String, String>.from(msg.data));
      });
    } catch (err) {
      // Don't block login if push fails to initialize.
      // ignore: avoid_print
      print('[push] init skipped: $err');
    }
  }

  /// Delete the current token from the backend and stop refresh listeners.
  /// Also invalidates the FCM-side token via `messaging.deleteToken()`
  /// so any in-flight messages addressed to the old token are dropped
  /// by FCM rather than landing on this device — closes the privacy
  /// window where the previous account's notifications could leak in
  /// on the next user's session.
  Future<void> unregister() async {
    final token = _currentToken;
    await _tokenSub?.cancel();
    await _msgSub?.cancel();
    _tokenSub = null;
    _msgSub = null;
    _currentToken = null;
    if (token == null) return;
    // Order matters: delete server-side first so the backend stops
    // sending; THEN invalidate the FCM token. Reversed order leaves
    // a brief window where the server still sends to a token that's
    // about to be invalidated, wasting an FCM call.
    try {
      await apiClient.dio.delete<Map<String, dynamic>>(
        '/api/v1/user/device-tokens',
        data: {'token': token},
      );
    } catch (_) {
      // Best-effort; don't block logout.
    }
    final messaging = _messaging;
    if (messaging != null) {
      try {
        await messaging.deleteToken();
      } catch (_) {
        // Best-effort. The next sign-in will fetch a fresh token via
        // `getToken()` regardless of whether the old one was cleanly
        // invalidated.
      }
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

/// Foreground data-message stream as a Riverpod source. Feature widgets
/// (suggestion strip, meeting chip, today screen, …) watch this and
/// invalidate their queries when the event matches their resource.
///
/// The stream is broadcast and never closes — it tracks the lifetime
/// of the PushClient instance, which is itself a singleton across the
/// app session.
final fcmForegroundEventsProvider =
    StreamProvider<Map<String, String>>((ref) async* {
  final client = await ref.watch(pushClientProvider.future);
  yield* client.foregroundData;
});
