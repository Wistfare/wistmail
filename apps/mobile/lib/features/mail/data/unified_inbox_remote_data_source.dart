import '../../../core/network/api_client.dart';
import '../domain/unified_inbox_item.dart';

/// Fetches the combined mail+chat feed from `GET /api/v1/inbox/unified`.
class UnifiedInboxRemoteDataSource {
  UnifiedInboxRemoteDataSource(this._api);
  final ApiClient _api;

  Future<UnifiedInboxPage> fetchPage({
    UnifiedFilter filter = UnifiedFilter.all,
    int limit = 50,
    DateTime? before,
  }) async {
    final res = await _api.dio.get<Map<String, dynamic>>(
      '/api/v1/inbox/unified',
      queryParameters: {
        'filter': filter.name,
        'limit': limit,
        if (before != null) 'before': before.toUtc().toIso8601String(),
      },
    );
    return UnifiedInboxPage.fromJson(res.data ?? const {});
  }
}
