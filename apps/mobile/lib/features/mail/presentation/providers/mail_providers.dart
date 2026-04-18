import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/network/providers.dart';
import '../../../../core/realtime/providers.dart';
import '../../../../core/realtime/realtime_event.dart';
import '../../data/mail_remote_data_source.dart';
import '../../data/mail_repository.dart';
import '../../domain/email.dart';

final mailRepositoryProvider = FutureProvider<MailRepository>((ref) async {
  final client = await ref.watch(apiClientProvider.future);
  return MailRepositoryImpl(MailRemoteDataSource(client));
});

class InboxState {
  const InboxState({
    this.emails = const [],
    this.isLoading = false,
    this.errorMessage,
    this.hasLoaded = false,
  });

  final List<Email> emails;
  final bool isLoading;
  final String? errorMessage;
  final bool hasLoaded;

  InboxState copyWith({
    List<Email>? emails,
    bool? isLoading,
    String? errorMessage,
    bool clearError = false,
    bool? hasLoaded,
  }) =>
      InboxState(
        emails: emails ?? this.emails,
        isLoading: isLoading ?? this.isLoading,
        errorMessage: clearError ? null : (errorMessage ?? this.errorMessage),
        hasLoaded: hasLoaded ?? this.hasLoaded,
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
      final page = await repo.listByFolder();
      state = state.copyWith(
        emails: page.emails,
        isLoading: false,
        hasLoaded: true,
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

  void applyLocal(Email updated) {
    final next = state.emails
        .map((e) => e.id == updated.id ? updated : e)
        .toList(growable: false);
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
        // Fetch the full email to get consistent fields (attachments etc).
        try {
          final repo = await _ref.read(mailRepositoryProvider.future);
          final email = await repo.getById(e.emailId);
          if (state.emails.any((x) => x.id == email.id)) return;
          final next = [email, ...state.emails];
          state = state.copyWith(emails: next);
        } catch (_) {
          // If getById fails, still run a refresh so the list stays consistent
          await refresh();
        }
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
        // If moved to a non-inbox folder, drop it from the list.
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

final mailboxesProvider = FutureProvider<List<Mailbox>>((ref) async {
  final repo = await ref.watch(mailRepositoryProvider.future);
  return repo.getMailboxes();
});
