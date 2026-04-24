import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/network/providers.dart';
import '../../data/search_remote_data_source.dart';
import '../../domain/search_results.dart';

final searchRemoteDataSourceProvider =
    FutureProvider<SearchRemoteDataSource>((ref) async {
  final api = await ref.watch(apiClientProvider.future);
  return SearchRemoteDataSource(api);
});

/// Active filter chip — All / From / Files / Date.
final searchFilterProvider =
    StateProvider<SearchFilter>((ref) => SearchFilter.all);

/// Debounced query text. We don't hit the network on every keystroke —
/// the controller pushes the raw value into `rawSearchQueryProvider`
/// and a 220ms debounce flips `debouncedSearchQueryProvider`.
final rawSearchQueryProvider = StateProvider<String>((ref) => '');

final debouncedSearchQueryProvider = StateProvider<String>((ref) => '');

/// Sets up a 220ms debounce listener. A screen wires this once in
/// `initState` via `ref.read(searchQueryDebounceProvider)` so the
/// controller fires even if the provider isn't otherwise watched.
final searchQueryDebounceProvider = Provider<void>((ref) {
  Timer? timer;
  ref.onDispose(() => timer?.cancel());
  ref.listen<String>(rawSearchQueryProvider, (_, next) {
    timer?.cancel();
    timer = Timer(const Duration(milliseconds: 220), () {
      ref.read(debouncedSearchQueryProvider.notifier).state = next;
    });
  });
});

/// Results for the (debounced) current query + active filter. Empty
/// query returns an empty result set without hitting the network.
final searchResultsProvider =
    FutureProvider.autoDispose<SearchResults>((ref) async {
  // Install the debounce subscriber side-effect.
  ref.watch(searchQueryDebounceProvider);

  final query = ref.watch(debouncedSearchQueryProvider);
  final filter = ref.watch(searchFilterProvider);
  if (query.trim().isEmpty) return SearchResults(query: query);
  final ds = await ref.watch(searchRemoteDataSourceProvider.future);
  return ds.search(query: query, filter: filter);
});
