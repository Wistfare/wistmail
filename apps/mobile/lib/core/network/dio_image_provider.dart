import 'dart:ui' as ui;

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/painting.dart';

/// Image provider that fetches via Dio, so authenticated endpoints
/// (`/api/v1/inbox/attachments/:id`) get the user's session cookie
/// + every request interceptor we've configured.
///
/// Flutter's built-in `Image.network` uses Dart's `HttpClient`, which
/// is a separate cookie store from Dio's `CookieManager` — so any
/// auth-gated image URL would fail with 401. Routing through Dio
/// solves it without rebuilding the cookie infrastructure.
///
/// Cache key is just the URL — Flutter's `ImageCache` dedupes
/// concurrent requests for the same URL.
@immutable
class DioImageProvider extends ImageProvider<DioImageProvider> {
  const DioImageProvider({
    required this.url,
    required this.dio,
    this.scale = 1.0,
  });

  final String url;
  final Dio dio;
  final double scale;

  @override
  Future<DioImageProvider> obtainKey(ImageConfiguration configuration) {
    return SynchronousFuture<DioImageProvider>(this);
  }

  @override
  ImageStreamCompleter loadImage(
    DioImageProvider key,
    ImageDecoderCallback decode,
  ) {
    return MultiFrameImageStreamCompleter(
      codec: _loadAsync(key, decode),
      scale: key.scale,
      debugLabel: url,
    );
  }

  Future<ui.Codec> _loadAsync(
    DioImageProvider key,
    ImageDecoderCallback decode,
  ) async {
    final response = await dio.get<List<int>>(
      url,
      options: Options(
        responseType: ResponseType.bytes,
        // Server may return any image type — the response type guard
        // on the default Dio config (`status < 500`) is fine for
        // images since 4xx still throws via the error interceptor.
      ),
    );
    final bytes = Uint8List.fromList(response.data ?? const []);
    if (bytes.isEmpty) {
      throw StateError('Empty image bytes from $url');
    }
    final buffer = await ui.ImmutableBuffer.fromUint8List(bytes);
    return decode(buffer);
  }

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is DioImageProvider && other.url == url && other.scale == scale;
  }

  @override
  int get hashCode => Object.hash(url, scale);

  @override
  String toString() => 'DioImageProvider(url: $url)';
}
