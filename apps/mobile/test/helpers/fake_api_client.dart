import 'dart:convert';
import 'package:cookie_jar/cookie_jar.dart';
import 'package:dio/dio.dart';
import 'package:wistmail/core/network/api_client.dart';

/// Creates an ApiClient with an in-memory Dio + in-memory cookie jar and
/// a customizable transport adapter so tests can respond to requests.
class FakeApiClientBuilder {
  FakeApiClientBuilder();

  final Map<String, _MockResponse> _routes = {};
  final List<RequestOptions> capturedRequests = [];

  void on(
    String method,
    String path, {
    int status = 200,
    Object? body,
    Map<String, List<String>>? headers,
  }) {
    _routes['${method.toUpperCase()} $path'] = _MockResponse(
      status: status,
      body: body,
      headers: headers,
    );
  }

  ApiClient build() {
    final jar = CookieJar();
    final client = ApiClient.create(baseUrl: 'http://test', cookieJar: jar);
    client.dio.httpClientAdapter = _FakeAdapter(this);
    return client;
  }
}

class _MockResponse {
  const _MockResponse({
    required this.status,
    this.body,
    this.headers,
  });
  final int status;
  final Object? body;
  final Map<String, List<String>>? headers;
}

class _FakeAdapter implements HttpClientAdapter {
  _FakeAdapter(this.builder);
  final FakeApiClientBuilder builder;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<List<int>>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    builder.capturedRequests.add(options);
    final key = '${options.method.toUpperCase()} ${options.path}';
    final mock = builder._routes[key];
    if (mock == null) {
      return ResponseBody.fromString(
        jsonEncode({
          'error': {'code': 'NOT_MOCKED', 'message': 'no mock for $key'}
        }),
        500,
        headers: {
          Headers.contentTypeHeader: ['application/json'],
        },
      );
    }

    final encoded = mock.body == null ? '' : jsonEncode(mock.body);
    return ResponseBody.fromString(
      encoded,
      mock.status,
      headers: {
        Headers.contentTypeHeader: ['application/json'],
        ...?mock.headers,
      },
    );
  }

  @override
  void close({bool force = false}) {}
}
