import 'dart:async';
import 'dart:convert';
import 'package:cookie_jar/cookie_jar.dart';
import 'package:web_socket_channel/web_socket_channel.dart';
import 'realtime_event.dart';

/// Minimal transport surface the [RealtimeClient] needs. Tests inject a fake
/// transport without touching the real WebSocket machinery.
abstract class RealtimeTransport {
  Stream<String> get incoming;
  Future<void> close();
}

typedef RealtimeTransportFactory = Future<RealtimeTransport> Function(
  Uri url,
  Map<String, String> headers,
);

class _WebSocketChannelTransport implements RealtimeTransport {
  _WebSocketChannelTransport(this._channel);
  final WebSocketChannel _channel;

  @override
  Stream<String> get incoming =>
      _channel.stream.map((dynamic data) => data is String ? data : '');

  @override
  Future<void> close() async {
    try {
      await _channel.sink.close();
    } catch (_) {}
  }
}

Future<RealtimeTransport> _defaultTransportFactory(
  Uri url,
  Map<String, String> headers,
) async {
  final channel = WebSocketChannel.connect(url);
  await channel.ready;
  return _WebSocketChannelTransport(channel);
}

enum RealtimeConnectionStatus { disconnected, connecting, connected }

/// Maintains a persistent WebSocket connection to /api/v1/stream with
/// exponential-backoff reconnects. Emits parsed events on [events].
class RealtimeClient {
  RealtimeClient({
    required this.baseUrl,
    required this.cookieJar,
    RealtimeTransportFactory transportFactory = _defaultTransportFactory,
    Duration initialBackoff = const Duration(seconds: 1),
    Duration maxBackoff = const Duration(seconds: 30),
  })  : _transportFactory = transportFactory,
        _initialBackoff = initialBackoff,
        _maxBackoff = maxBackoff,
        _backoff = initialBackoff;

  final String baseUrl;
  final CookieJar cookieJar;
  final RealtimeTransportFactory _transportFactory;
  final Duration _initialBackoff;
  final Duration _maxBackoff;

  final StreamController<RealtimeEvent> _events =
      StreamController<RealtimeEvent>.broadcast();
  final StreamController<RealtimeConnectionStatus> _status =
      StreamController<RealtimeConnectionStatus>.broadcast();

  RealtimeTransport? _transport;
  StreamSubscription<String>? _subscription;
  Timer? _reconnectTimer;
  Duration _backoff;
  bool _disposed = false;
  bool _shouldReconnect = false;

  Stream<RealtimeEvent> get events => _events.stream;
  Stream<RealtimeConnectionStatus> get status => _status.stream;

  Uri get streamUri {
    final httpUri = Uri.parse(baseUrl);
    final scheme = httpUri.scheme == 'https' ? 'wss' : 'ws';
    return httpUri.replace(scheme: scheme, path: '/api/v1/stream');
  }

  /// Establish the connection. Safe to call when already connected or
  /// connecting — acts as a no-op in those cases.
  Future<void> connect() async {
    if (_disposed) return;
    _shouldReconnect = true;
    if (_transport != null || _reconnectTimer != null) return;
    _backoff = _initialBackoff;
    await _open();
  }

  /// Stop reconnecting and close the current connection.
  Future<void> disconnect() async {
    _shouldReconnect = false;
    _reconnectTimer?.cancel();
    _reconnectTimer = null;
    await _closeTransport();
    _emitStatus(RealtimeConnectionStatus.disconnected);
  }

  Future<void> dispose() async {
    _disposed = true;
    await disconnect();
    await _events.close();
    await _status.close();
  }

  Future<void> _open() async {
    if (_disposed) return;
    _emitStatus(RealtimeConnectionStatus.connecting);
    try {
      final cookieHeader = await _cookieHeader();
      final headers = <String, String>{};
      if (cookieHeader != null) headers['cookie'] = cookieHeader;

      final transport = await _transportFactory(streamUri, headers);
      _transport = transport;

      _subscription = transport.incoming.listen(
        _handleMessage,
        onError: (Object err) {
          _scheduleReconnect();
        },
        onDone: () {
          _scheduleReconnect();
        },
        cancelOnError: true,
      );

      _emitStatus(RealtimeConnectionStatus.connected);
      _backoff = _initialBackoff;
    } catch (_) {
      _scheduleReconnect();
    }
  }

  void _handleMessage(String payload) {
    if (payload.isEmpty) return;
    try {
      final json = jsonDecode(payload);
      if (json is! Map<String, dynamic>) return;
      final event = RealtimeEvent.fromJson(json);
      if (event != null) _events.add(event);
    } catch (_) {
      // Ignore malformed frames — the server is the source of truth.
    }
  }

  Future<String?> _cookieHeader() async {
    final cookies = await cookieJar.loadForRequest(Uri.parse(baseUrl));
    if (cookies.isEmpty) return null;
    return cookies.map((c) => '${c.name}=${c.value}').join('; ');
  }

  void _scheduleReconnect() {
    _closeTransport();
    if (!_shouldReconnect || _disposed) return;
    _emitStatus(RealtimeConnectionStatus.disconnected);
    _reconnectTimer?.cancel();
    _reconnectTimer = Timer(_backoff, () {
      _reconnectTimer = null;
      _open();
    });
    final nextMs = (_backoff.inMilliseconds * 2).clamp(
      _initialBackoff.inMilliseconds,
      _maxBackoff.inMilliseconds,
    );
    _backoff = Duration(milliseconds: nextMs);
  }

  Future<void> _closeTransport() async {
    await _subscription?.cancel();
    _subscription = null;
    await _transport?.close();
    _transport = null;
  }

  void _emitStatus(RealtimeConnectionStatus s) {
    if (_status.isClosed) return;
    _status.add(s);
  }
}
