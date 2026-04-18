import 'dart:async';
import 'dart:convert';
import 'package:cookie_jar/cookie_jar.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:wistmail/core/realtime/realtime_client.dart';
import 'package:wistmail/core/realtime/realtime_event.dart';

class _FakeTransport implements RealtimeTransport {
  _FakeTransport();
  final StreamController<String> _controller = StreamController<String>();

  void push(Map<String, dynamic> event) {
    if (_controller.isClosed) return;
    _controller.add(jsonEncode(event));
  }

  void remoteClose() {
    if (!_controller.isClosed) _controller.close();
  }

  @override
  Stream<String> get incoming => _controller.stream;

  @override
  Future<void> close() async {
    if (!_controller.isClosed) await _controller.close();
  }
}

void main() {
  group('RealtimeClient', () {
    test('parses and forwards events to the events stream', () async {
      late _FakeTransport transport;
      final client = RealtimeClient(
        baseUrl: 'http://test',
        cookieJar: CookieJar(),
        transportFactory: (url, headers) async {
          transport = _FakeTransport();
          return transport;
        },
      );

      final events = <RealtimeEvent>[];
      client.events.listen(events.add);
      await client.connect();
      await Future<void>.delayed(Duration.zero);

      transport.push({
        'type': 'email.new',
        'userId': 'u_1',
        'emailId': 'e1',
        'mailboxId': 'mbx_1',
        'folder': 'inbox',
        'fromAddress': 'x@y.com',
        'subject': 'Hi',
        'preview': '',
        'createdAt': '2026-01-01T00:00:00Z',
      });
      await Future<void>.delayed(Duration.zero);

      expect(events.whereType<EmailNewEvent>().length, 1);
      await client.dispose();
    });

    test('uses ws scheme for http base URL', () {
      final client = RealtimeClient(
        baseUrl: 'http://example.com:3001',
        cookieJar: CookieJar(),
      );
      final uri = client.streamUri;
      expect(uri.scheme, 'ws');
      expect(uri.path, '/api/v1/stream');
      expect(uri.host, 'example.com');
      expect(uri.port, 3001);
    });

    test('uses wss scheme for https base URL', () {
      final client = RealtimeClient(
        baseUrl: 'https://api.wistfare.com',
        cookieJar: CookieJar(),
      );
      expect(client.streamUri.scheme, 'wss');
    });

    test('attempts to reconnect after the remote closes', () async {
      var connectCount = 0;
      _FakeTransport? latest;
      final client = RealtimeClient(
        baseUrl: 'http://test',
        cookieJar: CookieJar(),
        initialBackoff: const Duration(milliseconds: 10),
        maxBackoff: const Duration(milliseconds: 20),
        transportFactory: (url, headers) async {
          connectCount++;
          latest = _FakeTransport();
          return latest!;
        },
      );

      await client.connect();
      expect(connectCount, 1);

      latest!.remoteClose();
      await Future<void>.delayed(const Duration(milliseconds: 80));

      expect(connectCount, greaterThanOrEqualTo(2));
      await client.dispose();
    });

    test('disconnect stops reconnection attempts', () async {
      var connectCount = 0;
      _FakeTransport? latest;
      final client = RealtimeClient(
        baseUrl: 'http://test',
        cookieJar: CookieJar(),
        initialBackoff: const Duration(milliseconds: 10),
        maxBackoff: const Duration(milliseconds: 10),
        transportFactory: (url, headers) async {
          connectCount++;
          latest = _FakeTransport();
          return latest!;
        },
      );

      await client.connect();
      await client.disconnect();
      latest!.remoteClose();
      await Future<void>.delayed(const Duration(milliseconds: 60));

      // No reconnect should have happened after disconnect.
      expect(connectCount, 1);
      await client.dispose();
    });

    test('includes cookie header on connect when cookies are present', () async {
      final jar = CookieJar();
      await jar.saveFromResponse(
        Uri.parse('http://test/'),
        [],
      );
      Map<String, String>? capturedHeaders;
      final client = RealtimeClient(
        baseUrl: 'http://test',
        cookieJar: jar,
        transportFactory: (url, headers) async {
          capturedHeaders = headers;
          return _FakeTransport();
        },
      );
      await client.connect();
      expect(capturedHeaders, isNotNull);
      await client.dispose();
    });
  });
}
