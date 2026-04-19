import 'dart:io';

import 'package:cookie_jar/cookie_jar.dart';
import 'package:dio/dio.dart';
import 'package:dio/io.dart';
import 'package:dio_cookie_manager/dio_cookie_manager.dart';
import 'api_exception.dart';

class ApiClient {
  ApiClient._(this._dio, this.cookieJar);

  final Dio _dio;
  final CookieJar cookieJar;

  Dio get dio => _dio;

  static ApiClient create({required String baseUrl, required CookieJar cookieJar}) {
    final dio = Dio(
      BaseOptions(
        baseUrl: baseUrl,
        connectTimeout: const Duration(seconds: 15),
        receiveTimeout: const Duration(seconds: 30),
        contentType: 'application/json',
        responseType: ResponseType.json,
        validateStatus: (status) => status != null && status < 500,
        // Ask the server to gzip — Dart's HttpClient transparently
        // decompresses, so consumers never see the encoding header.
        headers: const {'Accept-Encoding': 'gzip'},
      ),
    );

    // Tune the underlying HttpClient: persistent connections + a small
    // pool keep TLS handshakes off the hot path for inbox pagination /
    // realtime fan-in. The 90s idle timeout matches typical CDN keepalive.
    dio.httpClientAdapter = IOHttpClientAdapter(
      createHttpClient: () {
        final c = HttpClient()
          ..maxConnectionsPerHost = 6
          ..idleTimeout = const Duration(seconds: 90)
          ..autoUncompress = true
          ..connectionTimeout = const Duration(seconds: 15);
        return c;
      },
    );

    dio.interceptors.add(CookieManager(cookieJar));
    dio.interceptors.add(_ErrorInterceptor());
    return ApiClient._(dio, cookieJar);
  }

  Future<void> clearCookies() async {
    await cookieJar.deleteAll();
  }
}

class _ErrorInterceptor extends Interceptor {
  @override
  void onResponse(Response response, ResponseInterceptorHandler handler) {
    final status = response.statusCode ?? 0;
    if (status >= 400) {
      handler.reject(
        DioException(
          requestOptions: response.requestOptions,
          response: response,
          type: DioExceptionType.badResponse,
          error: _toApiException(response),
        ),
      );
      return;
    }
    handler.next(response);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    if (err.error is ApiException) {
      handler.next(err);
      return;
    }
    final apiError = err.response != null
        ? _toApiException(err.response!)
        : ApiException(
            code: 'NETWORK_ERROR',
            message: err.message ?? 'Network error',
          );
    handler.next(
      DioException(
        requestOptions: err.requestOptions,
        response: err.response,
        type: err.type,
        error: apiError,
      ),
    );
  }

  ApiException _toApiException(Response response) {
    final data = response.data;
    if (data is Map && data['error'] is Map) {
      final error = data['error'] as Map;
      return ApiException(
        code: (error['code'] as String?) ?? 'UNKNOWN',
        message: (error['message'] as String?) ?? 'Unknown error',
        statusCode: response.statusCode,
        details: error['details'] as Map<String, dynamic>?,
      );
    }
    if (data is Map && data['error'] is String) {
      return ApiException(
        code: 'ERROR',
        message: data['error'] as String,
        statusCode: response.statusCode,
      );
    }
    return ApiException(
      code: 'HTTP_${response.statusCode ?? 0}',
      message: response.statusMessage ?? 'Request failed',
      statusCode: response.statusCode,
    );
  }
}
