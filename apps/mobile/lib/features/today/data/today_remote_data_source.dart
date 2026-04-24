import '../../../../core/network/api_client.dart';
import '../domain/today_summary.dart';

/// Thin wrapper around `GET /api/v1/today`. Kept in the data layer so
/// the provider can mock it in widget tests without touching Dio.
class TodayRemoteDataSource {
  TodayRemoteDataSource(this._api);

  final ApiClient _api;

  Future<TodaySummary> fetchSummary() async {
    final res = await _api.dio.get<Map<String, dynamic>>('/api/v1/today');
    return TodaySummary.fromJson(res.data ?? const {});
  }
}
