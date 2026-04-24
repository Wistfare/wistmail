import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/network/providers.dart';
import '../../data/today_remote_data_source.dart';
import '../../domain/today_summary.dart';

final todayRemoteDataSourceProvider = FutureProvider<TodayRemoteDataSource>((ref) async {
  final api = await ref.watch(apiClientProvider.future);
  return TodayRemoteDataSource(api);
});

/// Today summary, auto-refreshed on subscription. The screen wraps this
/// in a `RefreshIndicator` to let the user force a re-fetch.
final todaySummaryProvider = FutureProvider.autoDispose<TodaySummary>((ref) async {
  final ds = await ref.watch(todayRemoteDataSourceProvider.future);
  return ds.fetchSummary();
});
