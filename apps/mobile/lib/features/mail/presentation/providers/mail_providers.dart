import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/network/providers.dart';
import '../../../../core/realtime/providers.dart';
import '../../../../core/realtime/realtime_event.dart';
import '../../data/mail_remote_data_source.dart';
import '../../data/mail_repository.dart';
import '../../domain/email.dart';
import '../../domain/reply_suggestion.dart';

const int kInboxPageSize = 50;

/// Folders the inbox view supports. Literal folders map to the `folder`
/// column on the server; synthetic ones (`starred`, `snoozed`,
/// `scheduled`, `all`) are derived server-side from other columns.
class InboxFolder {
  const InboxFolder._(this.id, this.label);
  final String id;
  final String label;

  static const inbox = InboxFolder._('inbox', 'Inbox');
  static const starred = InboxFolder._('starred', 'Starred');
  static const snoozed = InboxFolder._('snoozed', 'Snoozed');
  static const sent = InboxFolder._('sent', 'Sent');
  static const drafts = InboxFolder._('drafts', 'Drafts');
  static const scheduled = InboxFolder._('scheduled', 'Scheduled');
  static const archive = InboxFolder._('archive', 'Archive');
  static const trash = InboxFolder._('trash', 'Trash');
  static const spam = InboxFolder._('spam', 'Spam');
  static const all = InboxFolder._('all', 'All Mail');

  static const values = [
    inbox,
    starred,
    snoozed,
    sent,
    drafts,
    scheduled,
    archive,
    trash,
    spam,
    all,
  ];

  static InboxFolder fromId(String id) {
    for (final f in values) {
      if (f.id == id) return f;
    }
    return inbox;
  }
}

/// The active folder the inbox view is showing. Tapping a drawer entry
/// updates this; the InboxController listens and reloads.
final currentFolderProvider = StateProvider<InboxFolder>(
  (ref) => InboxFolder.inbox,
);

/// Row-level filter over the current folder's list. Applied
/// client-side against the page already loaded (same pattern as
/// web) — no extra network, filters compose naturally with folder
/// selection. Clearing the folder resets this to 'all'.
enum InboxFilter { all, unread, starred, attachments }

final inboxFilterProvider = StateProvider<InboxFilter>((ref) {
  ref.listen<InboxFolder>(currentFolderProvider, (prev, next) {
    if (prev?.id != next.id) {
      ref.controller.state = InboxFilter.all;
    }
  });
  return InboxFilter.all;
});

/// Set of email ids currently marked by the user for a bulk action.
/// Non-empty → the inbox renders its "selection mode" app bar and
/// rows toggle on tap instead of opening. Kept as a StateProvider
/// (not a local widget State) so it survives hot reload / scroll-
/// reparenting and so the app bar widget can observe it from
/// outside the list subtree.
final selectedEmailIdsProvider = StateProvider<Set<String>>((ref) {
  // Clear the selection whenever the active folder flips — a set
  // of ids from /inbox has no meaning against /trash, and leaving
  // them staged would silently batch across folders on the next
  // action.
  ref.listen<InboxFolder>(currentFolderProvider, (prev, next) {
    if (prev?.id != next.id) {
      ref.controller.state = const <String>{};
    }
  });
  return const <String>{};
});

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
  }) => InboxState(
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
    _subscribeToFolder();
  }

  final Ref _ref;
  ProviderSubscription<AsyncValue<RealtimeEvent>>? _eventSub;
  ProviderSubscription<InboxFolder>? _folderSub;

  /// Reload whenever the user picks a different folder from the drawer.
  /// We clear local state immediately so the UI doesn't flash stale
  /// rows from the previous folder; load() then fills in the new view.
  void _subscribeToFolder() {
    _folderSub = _ref.listen<InboxFolder>(currentFolderProvider, (prev, next) {
      if (prev?.id == next.id) return;
      state = state.copyWith(
        emails: const [],
        hasLoaded: false,
        page: 0,
        hasMore: false,
        clearError: true,
      );
      load();
    });
  }

  Future<void> load() async {
    state = state.copyWith(isLoading: true, clearError: true);
    try {
      final repo = await _ref.read(mailRepositoryProvider.future);
      final folder = _ref.read(currentFolderProvider);
      final pageResult = await repo.listByFolder(
        folder: folder.id,
        page: 1,
        pageSize: kInboxPageSize,
      );
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
      final folder = _ref.read(currentFolderProvider);
      final pageResult = await repo.listByFolder(
        folder: folder.id,
        page: next,
        pageSize: kInboxPageSize,
      );
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
        final next = state.emails
            .map((em) {
              if (em.id != e.emailId) return em;
              return em.copyWith(
                isRead: e.isRead,
                isStarred: e.isStarred,
                folder: e.folder,
              );
            })
            .toList(growable: false);
        state = state.copyWith(emails: next);
        if (e.folder != null && e.folder != 'inbox') {
          removeLocal(e.emailId);
        }
      case EmailDeletedEvent e:
        removeLocal(e.emailId);
      case EmailSendStatusEvent e:
        // Drafts-as-outbox lifecycle — flip the row's pill to its
        // server-confirmed terminal state without a refetch.
        final next = state.emails
            .map((em) {
              if (em.id != e.emailId) return em;
              return em.copyWith(status: e.status, sendError: e.error);
            })
            .toList(growable: false);
        state = state.copyWith(emails: next);
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
    _folderSub?.close();
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

final mailUnreadCountsProvider = FutureProvider<Map<String, int>>((ref) async {
  final repo = await ref.watch(mailRepositoryProvider.future);
  return repo.getUnreadCounts();
});

final mailUnreadTotalProvider = Provider<int>((ref) {
  final counts = ref.watch(mailUnreadCountsProvider);
  return counts.maybeWhen(
    data: (v) => v['total'] ?? v['inbox'] ?? 0,
    orElse: () => ref.watch(inboxUnreadCountProvider),
  );
});

final emailDetailProvider = FutureProvider.autoDispose.family<Email, String>((
  ref,
  id,
) async {
  final repo = await ref.watch(mailRepositoryProvider.future);
  final email = await repo.getById(id);
  if (!email.isRead) {
    unawaited(() async {
      try {
        await repo.markRead(id);
        ref
            .read(inboxControllerProvider.notifier)
            .applyLocal(email.copyWith(isRead: true));
      } catch (_) {}
    }());
  }
  return email;
});

/// AI reply suggestions for an open email. The ai-worker produces these
/// out-of-band, so the provider may resolve to an empty list shortly
/// after the email arrives — the Thread screen handles that by simply
/// not rendering the suggestion strip.
final replySuggestionsProvider =
    FutureProvider.autoDispose.family<List<ReplySuggestion>, String>((
  ref,
  emailId,
) async {
  final repo = await ref.watch(mailRepositoryProvider.future);
  return repo.getReplySuggestions(emailId);
});

/// Mailboxes change rarely (only when the user adds/removes a domain) so
/// we cache them at the provider level and have compose / settings read
/// from the same cached value rather than each refetching.
final mailboxesProvider = FutureProvider<List<Mailbox>>((ref) async {
  final repo = await ref.watch(mailRepositoryProvider.future);
  return repo.getMailboxes();
});
