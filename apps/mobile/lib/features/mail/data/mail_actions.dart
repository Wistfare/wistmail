import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/local/email_local_store.dart';
import '../../../core/local/local_providers.dart';
import '../../../core/local/outbox.dart';
import '../../../core/local/sync_engine.dart';
import '../domain/email.dart';
import '../presentation/providers/mail_providers.dart';

/// Façade that screens call instead of hitting `MailRepository` directly.
///
/// Every action is two steps: (1) flip the in-memory + on-disk state
/// instantly so the UI reflects the user's intent in the same frame,
/// (2) enqueue an outbox row that the SyncEngine will dispatch in the
/// background. Coalescing means tap-tap-tap on a star produces a
/// single HTTP call.
class MailActions {
  MailActions(this._engine, this._store, this._inboxNotifier);

  final SyncEngine _engine;
  final EmailLocalStore _store;
  final InboxController _inboxNotifier;

  Future<void> toggleStar(Email email) async {
    final next = !email.isStarred;
    // Update both the in-memory inbox state (so the active screen
    // reflects the change) AND the durable local store (so the next
    // screen + a kill-restart see it too).
    _inboxNotifier.applyLocal(email.copyWith(isStarred: next));
    await _store.applyLocalMutation(id: email.id, isStarred: next);
    await _engine.enqueue(
      entityType: 'email',
      entityId: email.id,
      op: OutboxOp.setStarred,
      payload: {'value': next},
    );
  }

  Future<void> setRead(Email email, bool read) async {
    if (email.isRead == read) return;
    _inboxNotifier.applyLocal(email.copyWith(isRead: read));
    await _store.applyLocalMutation(id: email.id, isRead: read);
    await _engine.enqueue(
      entityType: 'email',
      entityId: email.id,
      op: OutboxOp.setRead,
      payload: {'value': read},
    );
  }

  Future<void> archive(Email email) async {
    _inboxNotifier.removeLocal(email.id);
    await _store.applyLocalMutation(id: email.id, folder: 'archive');
    await _engine.enqueue(
      entityType: 'email',
      entityId: email.id,
      op: OutboxOp.archive,
    );
  }

  Future<void> delete(Email email) async {
    _inboxNotifier.removeLocal(email.id);
    await _store.applyLocalMutation(id: email.id, folder: 'trash');
    await _engine.enqueue(
      entityType: 'email',
      entityId: email.id,
      op: OutboxOp.delete,
    );
  }

  /// Re-enqueue a failed or rate-limited send. The UI flips the pill
  /// to 'sending' immediately; the engine fires the dispatch HTTP
  /// call and the WS event reconciles to the terminal state.
  Future<void> retrySend(Email email) async {
    _inboxNotifier
        .applyLocal(email.copyWith(status: 'sending', sendError: null));
    await _store.applyLocalMutation(
      id: email.id,
      status: 'sending',
      sendError: null,
    );
    await _engine.enqueue(
      entityType: 'email',
      entityId: email.id,
      op: OutboxOp.dispatchSend,
    );
  }
}

/// Riverpod accessor — composes the engine + store + controller. The
/// future resolves once the local DB has opened, which happens once
/// per app lifetime.
final mailActionsProvider = FutureProvider<MailActions>((ref) async {
  final engine = await ref.watch(syncEngineProvider.future);
  final store = await ref.watch(emailLocalStoreProvider.future);
  final inbox = ref.read(inboxControllerProvider.notifier);
  return MailActions(engine, store, inbox);
});
