import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/network/providers.dart';
import '../../data/me_remote_data_source.dart';
import '../../domain/me_models.dart';

final meRemoteDataSourceProvider = FutureProvider<MeRemoteDataSource>((ref) async {
  final api = await ref.watch(apiClientProvider.future);
  return MeRemoteDataSource(api);
});

final meStatsProvider = FutureProvider.autoDispose<MeStats>((ref) async {
  final ds = await ref.watch(meRemoteDataSourceProvider.future);
  return ds.fetchStats();
});

final mePreferencesProvider = FutureProvider.autoDispose<MePreferences>((ref) async {
  final ds = await ref.watch(meRemoteDataSourceProvider.future);
  return ds.fetchPreferences();
});

final meConnectedAccountsProvider =
    FutureProvider.autoDispose<List<MeConnectedAccount>>((ref) async {
  final ds = await ref.watch(meRemoteDataSourceProvider.future);
  return ds.fetchConnectedAccounts();
});

/// Controller for focus-mode + notification prefs mutations. Optimistic:
/// flips the cached value immediately, then reconciles with the server.
class MePreferencesController extends StateNotifier<AsyncValue<MePreferences>> {
  MePreferencesController(this._ref) : super(const AsyncValue.loading()) {
    _load();
  }

  final Ref _ref;

  Future<void> _load() async {
    try {
      final ds = await _ref.read(meRemoteDataSourceProvider.future);
      final prefs = await ds.fetchPreferences();
      state = AsyncValue.data(prefs);
    } catch (e, st) {
      state = AsyncValue.error(e, st);
    }
  }

  Future<void> toggleFocusMode({Duration? until}) async {
    final current = state.valueOrNull ?? MePreferences.empty;
    final newEnabled = !current.focusModeEnabled;
    final newUntil = newEnabled
        ? (until != null ? DateTime.now().add(until) : null)
        : null;
    state = AsyncValue.data(
      MePreferences(
        focusModeEnabled: newEnabled,
        focusModeUntil: newUntil,
        notificationPrefs: current.notificationPrefs,
      ),
    );
    try {
      final ds = await _ref.read(meRemoteDataSourceProvider.future);
      await ds.updatePreferences(
        focusModeEnabled: newEnabled,
        focusModeUntil: newUntil,
        clearFocusModeUntil: !newEnabled,
      );
    } catch (_) {
      // Roll back on failure — surfacing an error banner here would
      // conflict with the compact Me layout; the next refresh will
      // converge to server state.
      state = AsyncValue.data(current);
      rethrow;
    }
  }

  Future<void> setNotificationPref({bool? mail, bool? chat, bool? calendar}) async {
    final current = state.valueOrNull ?? MePreferences.empty;
    final next = current.notificationPrefs
        .copyWith(mail: mail, chat: chat, calendar: calendar);
    state = AsyncValue.data(
      MePreferences(
        focusModeEnabled: current.focusModeEnabled,
        focusModeUntil: current.focusModeUntil,
        notificationPrefs: next,
      ),
    );
    try {
      final ds = await _ref.read(meRemoteDataSourceProvider.future);
      await ds.updatePreferences(notificationPrefs: next);
    } catch (_) {
      state = AsyncValue.data(current);
      rethrow;
    }
  }
}

final mePreferencesControllerProvider = StateNotifierProvider.autoDispose<
    MePreferencesController, AsyncValue<MePreferences>>(
  (ref) => MePreferencesController(ref),
);
