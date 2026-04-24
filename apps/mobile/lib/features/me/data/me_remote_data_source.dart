import '../../../../core/network/api_client.dart';
import '../domain/me_models.dart';

/// HTTP adapter for the Me screen. One class, three endpoints — each
/// method stays a one-liner so mocking in widget tests is trivial.
class MeRemoteDataSource {
  MeRemoteDataSource(this._api);
  final ApiClient _api;

  Future<MeStats> fetchStats() async {
    final res = await _api.dio.get<Map<String, dynamic>>('/api/v1/user/me/stats');
    return MeStats.fromJson(res.data ?? const {});
  }

  Future<MePreferences> fetchPreferences() async {
    final res =
        await _api.dio.get<Map<String, dynamic>>('/api/v1/user/preferences');
    return MePreferences.fromJson(res.data ?? const {});
  }

  Future<void> updatePreferences({
    bool? focusModeEnabled,
    DateTime? focusModeUntil,
    bool clearFocusModeUntil = false,
    MeNotificationPrefs? notificationPrefs,
  }) async {
    final payload = <String, dynamic>{};
    if (focusModeEnabled != null) payload['focusModeEnabled'] = focusModeEnabled;
    if (clearFocusModeUntil) {
      payload['focusModeUntil'] = null;
    } else if (focusModeUntil != null) {
      payload['focusModeUntil'] = focusModeUntil.toUtc().toIso8601String();
    }
    if (notificationPrefs != null) {
      payload['notificationPrefs'] = notificationPrefs.toJson();
    }
    await _api.dio.put('/api/v1/user/preferences', data: payload);
  }

  Future<List<MeConnectedAccount>> fetchConnectedAccounts() async {
    final res = await _api.dio
        .get<Map<String, dynamic>>('/api/v1/user/connected-accounts');
    final raw = (res.data?['accounts'] as List?) ?? const [];
    return raw
        .whereType<Map<String, dynamic>>()
        .map(MeConnectedAccount.fromJson)
        .toList(growable: false);
  }
}
