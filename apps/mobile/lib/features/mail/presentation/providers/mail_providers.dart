import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/network/providers.dart';
import '../../../../core/realtime/providers.dart';
import '../../../../core/realtime/realtime_event.dart';
import '../../data/mail_remote_data_source.dart';
import '../../data/mail_repository.dart';
import '../../domain/email.dart';

const int kInboxPageSize = 50;

final mailRepositoryProvider = FutureProvider<MailRepository>((ref) async {
  final client = await ref.watch(apiClientProvider.future);
  return MailRepositoryImpl(MailRemoteDataSource(client));
});

class InboxState {
  const InboxState({
    this.emails = const [],
    this.isLoading = false,
    this.isLoadingMore = false,
    this.errorMessage,
    this.hasLoaded = false,
    this.hasMore = false,
    this.page = 0,
  });

  final List<Email> emails;
  final bool isLoading;
  final bool isLoadingMore;
  final String? errorMessage;
  final bool hasLoaded;
  final bool hasMore;
  final int page;

  /// Cheap derived value used by the bottom-nav badge. Cached so widgets
  /// that watch it only rebuild when emails actually change.
  int get unreadCount {
    int n = 0;
    for (final e in emails) {
      if (!e.isRead) n++;
    }
    return n;
  }

  InboxState copyWith({
    List<Email>? emails,
    bool? isLoading,
    bool? isLoadingMore,
    String? errorMessage,
    bool clearError = false,
    bool? hasLoaded,
    bool? hasMore,
    int? page,
  }) =>
      InboxState(
        emails: emails ?? this.emails,
        isLoading: isLoading ?? this.isLoading,
        isLoadingMore: isLoadingMore ?? this.isLoadingMore,
        errorMessage: clearError ? null : (errorMessage ?? this.errorMessage),
        hasLoaded: hasLoaded ?? this.hasLoaded,
        hasMore: hasMore ?? this.hasMore,
        page: page ?? this.page,
      );
}

class InboxController extends StateNotifier<InboxState> {
  InboxController(this._ref) : super(const InboxState()) {
    load();
    _subscribeToRealtime();
  }

  final Ref _ref;
  ProviderSubscription<AsyncValue<RealtimeEvent>>? _eventSub;

  Future<void> load() async {
    state = state.copyWith(isLoading: true, clearError: true);
    try {
      final repo = await _ref.read(mailRepositoryProvider.future);
      final pageResult = await repo.listByFolder(page: 1, pageSize: kInboxPageSize);
      state = state.copyWith(
        emails: pageResult.emails,
        isLoading: false,
        hasLoaded: true,
        hasMore: pageResult.hasMore,
        page: pageResult.page,
      );
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        errorMessage: _format(e),
        hasLoaded: true,
      );
    }
  }

  Future<void> refresh() => load();

  /// Append the next page when the user scrolls near the bottom. No-op if
  /// we're already loading more or have reached the end.
  Future<void> loadMore() async {
    if (state.isLoadingMore || !state.hasMore || state.isLoading) return;
    state = state.copyWith(isLoadingMore: true, clearError: true);
    try {
      final repo = await _ref.read(mailRepositoryProvider.future);
      final next = state.page + 1;
      final pageResult = await repo.listByFolder(page: next, pageSize: kInboxPageSize);
      // Merge by id to defend against duplicates across pages on refresh.
      final seen = <String>{for (final e in state.emails) e.id};
      final appended = [
        ...state.emails,
        for (final e in pageResult.emails)
          if (seen.add(e.id)) e,
      ];
      state = state.copyWith(
        emails: appended,
        isLoadingMore: false,
        hasMore: pageResult.hasMore,
        page: pageResult.page,
      );
    } catch (e) {
      state = state.copyWith(isLoadingMore: false, errorMessage: _format(e));
    }
  }

  void applyLocal(Email updated) {
    final next = [
      for (final e in state.emails)
        if (e.id == updated.id) updated else e,
    ];
    state = state.copyWith(emails: next);
  }

  void removeLocal(String emailId) {
    final next = state.emails.where((e) => e.id != emailId).toList();
    state = state.copyWith(emails: next);
  }

  void _subscribeToRealtime() {
    _eventSub = _ref.listen<AsyncValue<RealtimeEvent>>(
      realtimeEventStreamProvider,
      (prev, next) {
        next.whenData(_applyRealtimeEvent);
      },
    );
  }

  Future<void> _applyRealtimeEvent(RealtimeEvent event) async {
    switch (event) {
      case EmailNewEvent e:
        // Construct the row locally from the event payload — the server
        // now ships every list-row field over the wire, so we don't need
        // a follow-up HTTP fetch just to render the inbox row.
        if (state.emails.any((x) => x.id == e.emailId)) return;
        final email = Email(
          id: e.emailId,
          fromAddress: e.fromAddress,
          toAddresses: e.toAddresses,
          cc: e.cc,
          subject: e.subject,
          snippet: e.snippet,
          textBody: e.snippet.isNotEmpty ? e.snippet : e.preview,
          folder: e.folder,
          isRead: e.isRead,
          isStarred: e.isStarred,
          isDraft: e.isDraft,
          hasAttachments: e.hasAttachments,
          sizeBytes: e.sizeBytes,
          createdAt: e.createdAt,
          mailboxId: e.mailboxId,
        );
        state = state.copyWith(emails: [email, ...state.emails]);
      case EmailUpdatedEvent e:
        final next = state.emails.map((em) {
          if (em.id != e.emailId) return em;
          return em.copyWith(
            isRead: e.isRead,
            isStarred: e.isStarred,
            folder: e.folder,
          );
        }).toList(growable: false);
        state = state.copyWith(emails: next);
        if (e.folder != null && e.folder != 'inbox') {
          removeLocal(e.emailId);
        }
      case EmailDeletedEvent e:
        removeLocal(e.emailId);
      default:
        break;
    }
  }

  String _format(Object error) {
    final msg = error.toString();
    final match = RegExp(r'ApiException\([^)]*\):\s*(.*)$').firstMatch(msg);
    return match != null ? match.group(1)! : 'Could not load inbox.';
  }

  @override
  void dispose() {
    _eventSub?.close();
    super.dispose();
  }
}

final inboxControllerProvider =
    StateNotifierProvider<InboxController, InboxState>(
  (ref) => InboxController(ref),
);

/// Stable derived selector — bottom nav and other badge consumers should
/// `ref.watch(inboxUnreadCountProvider)` so they only rebuild when the
/// count actually changes (not on every list churn).
final inboxUnreadCountProvider = Provider<int>(
  (ref) => ref.watch(inboxControllerProvider.select((s) => s.unreadCount)),
);

final emailDetailProvider =
    FutureProvider.autoDispose.family<Email, String>((ref, id) async {
  final repo = await ref.watch(mailRepositoryProvider.future);
  final email = await repo.getById(id);
  if (!email.isRead) {
    unawaited(() async {
      try {
        await repo.markRead(id);
        ref.read(inboxControllerProvider.notifier).applyLocal(
              email.copyWith(isRead: true),
            );
      } catch (_) {}
    }());
  }
  return email;
});

/// Mailboxes change rarely (only when the user adds/removes a domain) so
/// we cache them at the provider level and have compose / settings read
/// from the same cached value rather than each refetching.
final mailboxesProvider = FutureProvider<List<Mailbox>>((ref) async {
  final repo = await ref.watch(mailRepositoryProvider.future);
  return repo.getMailboxes();
});
