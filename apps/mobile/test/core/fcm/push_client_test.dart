import 'package:cookie_jar/cookie_jar.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:wistmail/core/fcm/push_client.dart';
import 'package:wistmail/core/network/api_client.dart';

void main() {
  group('PushClient (no Firebase)', () {
    test('registerForCurrentUser silently no-ops when Firebase unavailable', () async {
      // In the test environment Firebase is not initialized and
      // FirebaseMessaging.instance throws, so the client's null-handling path
      // is exercised. No exception should escape.
      final api = ApiClient.create(baseUrl: 'http://test', cookieJar: CookieJar());
      final client = PushClient(apiClient: api);
      await client.registerForCurrentUser();
      // Reaching here means no throw.
    });

    test('unregister silently no-ops when never registered', () async {
      final api = ApiClient.create(baseUrl: 'http://test', cookieJar: CookieJar());
      final client = PushClient(apiClient: api);
      await client.unregister();
    });
  });
}
