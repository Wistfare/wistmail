import 'dart:async';

import 'package:app_links/app_links.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../router/app_router.dart';

/// Wires up app-start + runtime deep-link handling.
///
/// Supports two entrypoint URL shapes:
///   1. `wistmail://auth/reset-password?token=<raw>` — custom scheme,
///      declared in AndroidManifest + Info.plist (CFBundleURLTypes).
///   2. `https://wistfare.com/reset-password?token=<raw>` — App Link
///      / Universal Link. Only fires when the AASA / assetlinks.json
///      is published on the host; otherwise the OS opens the URL in
///      the browser and the app never sees it, which is fine — the
///      web reset-password page already handles this path.
///
/// We centralise the parse here so adding a new deep link later (say
/// `wistmail://email/<id>`) only needs a new case in `_resolve`.
class DeepLinkHandler {
  DeepLinkHandler(this._router);

  final GoRouter _router;
  final AppLinks _appLinks = AppLinks();
  StreamSubscription<Uri>? _subscription;

  /// Runs once on app start. Picks up a cold-start link (the one
  /// that launched the process) AND listens for warm-start links
  /// (tapped while the app is already running / backgrounded).
  Future<void> start() async {
    try {
      final initial = await _appLinks.getInitialLink();
      if (initial != null) _handle(initial);
    } catch (_) {
      // Swallow — a platform that doesn't support deep links (tests,
      // unsupported desktop builds) shouldn't crash the app boot.
    }
    _subscription = _appLinks.uriLinkStream.listen(
      _handle,
      onError: (_) {
        // Runtime stream errors are non-fatal; the app keeps working,
        // the user just won't get auto-navigation for the failed
        // event. A warning log would be noise in production — the
        // user will eventually see the web fallback.
      },
    );
  }

  Future<void> dispose() async {
    await _subscription?.cancel();
    _subscription = null;
  }

  void _handle(Uri uri) {
    final target = _resolve(uri);
    if (target != null) _router.go(target);
  }

  /// Translate an external URL into a GoRouter location. Returning
  /// null means we don't know this link — the caller drops the
  /// event and the user ends up wherever they were.
  static String? _resolve(Uri uri) {
    // Custom scheme: wistmail://auth/reset-password?token=...
    //   uri.host = 'auth', uri.path = '/reset-password'
    // Https: https://wistfare.com/reset-password?token=...
    //   uri.host = 'wistfare.com', uri.path = '/reset-password'
    // Both share the /reset-password path trailing segment, so match
    // on that regardless of scheme.
    if (uri.path == '/reset-password') {
      final token = uri.queryParameters['token'];
      if (token == null || token.isEmpty) {
        return '/auth/reset-password';
      }
      return '/auth/reset-password?token=${Uri.encodeQueryComponent(token)}';
    }
    return null;
  }
}

/// Riverpod provider — keeps the handler alive for the app's lifetime
/// and starts listening as soon as something `watch`-es it. We wire
/// the first watch from `app.dart` right after the router is built,
/// after which the handler runs independently until the app tears
/// down. `keepAlive` so the subscription survives screen disposals.
final deepLinkHandlerProvider =
    FutureProvider<DeepLinkHandler>((ref) async {
  ref.keepAlive();
  final router = ref.watch(appRouterProvider);
  final handler = DeepLinkHandler(router);
  await handler.start();
  ref.onDispose(handler.dispose);
  return handler;
});
