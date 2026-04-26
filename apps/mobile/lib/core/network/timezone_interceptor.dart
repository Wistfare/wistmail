import 'package:dio/dio.dart';
import 'package:flutter_timezone/flutter_timezone.dart';

/// Sends the device's IANA timezone on every request so the API can
/// keep `users.timezone` fresh. The AI worker reads that column to
/// fire each user's daily Today digest at their **local** 00:00 —
/// without it everyone gets the briefing at the same wall time
/// regardless of where they live.
///
/// Resolution is async + cached on first hit. Failures are silent
/// (request goes through without the header; backend keeps using
/// whatever it last had stored).
class TimezoneInterceptor extends Interceptor {
  TimezoneInterceptor();

  String? _cachedTz;

  @override
  Future<void> onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    try {
      _cachedTz ??= await FlutterTimezone.getLocalTimezone();
      if (_cachedTz != null && _cachedTz!.isNotEmpty) {
        options.headers['X-Client-Timezone'] = _cachedTz!;
      }
    } catch (_) {
      // Best-effort. The backend uses the last-known stored TZ if we
      // don't supply one here.
    }
    handler.next(options);
  }
}
