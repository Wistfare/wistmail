import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/network/providers.dart';
import '../../data/unified_inbox_remote_data_source.dart';
import '../../domain/unified_inbox_item.dart';

final unifiedInboxDataSourceProvider =
    FutureProvider<UnifiedInboxRemoteDataSource>((ref) async {
  final api = await ref.watch(apiClientProvider.future);
  return UnifiedInboxRemoteDataSource(api);
});

/// Currently-selected filter chip (All / Mail / Chats). Kept as a
/// StateProvider so the list auto-rebuilds when the user toggles it.
final unifiedInboxFilterProvider =
    StateProvider<UnifiedFilter>((ref) => UnifiedFilter.all);

/// Simple paginator — holds the merged item list, the "has more" flag,
/// and the cursor. `loadMore` is idempotent while a fetch is in flight.
class UnifiedInboxState {
  const UnifiedInboxState({
    this.items = const [],
    this.hasMore = true,
    this.nextCursor,
    this.isLoading = false,
    this.isLoadingMore = false,
    this.errorMessage,
  });

  final List<UnifiedInboxItem> items;
  final bool hasMore;
  final String? nextCursor;
  final bool isLoading;
  final bool isLoadingMore;
  final String? errorMessage;

  UnifiedInboxState copyWith({
    List<UnifiedInboxItem>? items,
    bool? hasMore,
    String? nextCursor,
    bool? isLoading,
    bool? isLoadingMore,
    String? errorMessage,
    bool clearError = false,
    bool clearCursor = false,
  }) =>
      UnifiedInboxState(
        items: items ?? this.items,
        hasMore: hasMore ?? this.hasMore,
        nextCursor: clearCursor ? null : (nextCursor ?? this.nextCursor),
        isLoading: isLoading ?? this.isLoading,
        isLoadingMore: isLoadingMore ?? this.isLoadingMore,
        errorMessage: clearError ? null : (errorMessage ?? this.errorMessage),
      );
}

class UnifiedInboxController extends StateNotifier<UnifiedInboxState> {
  UnifiedInboxController(this._ref, this._filter)
      : super(const UnifiedInboxState(isLoading: true)) {
    refresh();
  }

  final Ref _ref;
  final UnifiedFilter _filter;

  Future<void> refresh() async {
    state = state.copyWith(
      isLoading: true,
      clearError: true,
      items: const [],
      hasMore: true,
      clearCursor: true,
    );
    try {
      final ds = await _ref.read(unifiedInboxDataSourceProvider.future);
      final page = await ds.fetchPage(filter: _filter);
      state = state.copyWith(
        items: page.items,
        hasMore: page.hasMore,
        nextCursor: page.nextCursor,
        isLoading: false,
      );
    } catch (e) {
      state =
          state.copyWith(isLoading: false, errorMessage: e.toString());
    }
  }

  Future<void> loadMore() async {
    if (state.isLoadingMore || !state.hasMore || state.nextCursor == null) return;
    state = state.copyWith(isLoadingMore: true);
    try {
      final ds = await _ref.read(unifiedInboxDataSourceProvider.future);
      final before = DateTime.parse(state.nextCursor!);
      final page = await ds.fetchPage(filter: _filter, before: before);
      state = state.copyWith(
        items: [...state.items, ...page.items],
        hasMore: page.hasMore,
        nextCursor: page.nextCursor,
        isLoadingMore: false,
      );
    } catch (e) {
      state = state.copyWith(
          isLoadingMore: false, errorMessage: e.toString());
    }
  }

  /// Optimistic local mutation: flip a row's `isUnread` flag without
  /// refetching. Called when the user reads an email — the row should
  /// drop bold immediately, and the screen-level unread count needs to
  /// reflect it. The mail_providers `emailDetailProvider` calls this
  /// alongside the server `markRead` mutation.
  void markEmailLocallyRead(String emailId) {
    final updated = state.items.map((item) {
      if (item.source == UnifiedSource.mail &&
          item.emailId == emailId &&
          item.isUnread) {
        return item.copyWith(isUnread: false);
      }
      return item;
    }).toList(growable: false);
    state = state.copyWith(items: updated);
  }
}

final unifiedInboxControllerProvider = StateNotifierProvider.autoDispose
    .family<UnifiedInboxController, UnifiedInboxState, UnifiedFilter>(
  (ref, filter) => UnifiedInboxController(ref, filter),
);
