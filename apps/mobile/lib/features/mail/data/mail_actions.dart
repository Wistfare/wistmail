import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/local/email_local_store.dart';
import '../../../core/local/local_providers.dart';
import '../../../core/local/outbox.dart';
import '../../../core/local/sync_engine.dart';
import '../../../core/network/api_exception.dart';
import '../domain/email.dart';
import '../presentation/providers/mail_providers.dart';
import 'mail_repository.dart';

/// Façade that screens call instead of hitting `MailRepository` directly.
///
/// Every action is two steps: (1) flip the in-memory + on-disk state
/// instantly so the UI reflects the user's intent in the same frame,
/// (2) enqueue an outbox row that the SyncEngine will dispatch in the
/// background. Coalescing means tap-tap-tap on a star produces a
/// single HTTP call.
class MailActions {
  MailActions(this._engine, this._store, this._inboxNotifier, this._repo);

  final SyncEngine _engine;
  final EmailLocalStore _store;
  final InboxController _inboxNotifier;
  final MailRepository _repo;

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

  /// Compose flow with optimistic local insert + offline-graceful
  /// fallback. The user sees the email in Sent with a "Sending…" pill
  /// the moment they tap Send.
  ///
  /// Path A (online): calls the compose endpoint synchronously. Server
  /// returns the real id; we swap the local placeholder to it.
  ///
  /// Path B (offline / network error): the email still lives in Sent
  /// as 'sending' and we enqueue a composeSend outbox row. The
  /// SyncEngine retries with backoff and the composeSend handler
  /// performs the swap once the network returns.
  ///
  /// Returns the resolved email id (real if online, temp if offline).
  Future<String> send(ComposeDraft draft) async {
    final tempId =
        'local_${DateTime.now().microsecondsSinceEpoch.toRadixString(36)}';
    final now = DateTime.now();
    final placeholder = Email(
      id: tempId,
      fromAddress: draft.fromAddress,
      toAddresses: draft.toAddresses,
      cc: draft.cc,
      bcc: draft.bcc,
      subject: draft.subject,
      snippet: _snippetFor(draft.textBody),
      textBody: draft.textBody,
      htmlBody: draft.htmlBody,
      folder: 'sent',
      isRead: true,
      isStarred: false,
      isDraft: false,
      hasAttachments: false,
      sizeBytes: (draft.textBody ?? '').length + (draft.htmlBody ?? '').length,
      status: 'sending',
      createdAt: now,
      updatedAt: now,
      mailboxId: draft.mailboxId,
    );
    await _store.upsertOne(placeholder, fromServer: false);

    try {
      final realId = await _repo.compose(draft);
      // Atomic id rewrite — outstanding WS events for `realId` will
      // now bind correctly. Subscribers re-emit via the swap's tick.
      await _store.swapId(oldId: tempId, newId: realId);
      return realId;
    } catch (err) {
      if (_isRetryable(err)) {
        // Hand the send off to the SyncEngine — it'll retry with
        // exponential backoff and the composeSend handler will swap
        // the id when delivery resolves. Pill stays "Sending".
        await _engine.enqueue(
          entityType: 'email',
          entityId: tempId,
          op: OutboxOp.composeSend,
          payload: draft.toJson(),
        );
        return tempId;
      }
      // Hard failure — flip the local row to 'failed' so the user
      // can retry from inbox. Re-throw so the caller can surface a
      // dialog if it wants to.
      await _store.applyLocalMutation(
        id: tempId,
        status: 'failed',
        sendError: err.toString(),
      );
      rethrow;
    }
  }

  bool _isRetryable(Object err) {
    if (err is ApiException) {
      final code = err.statusCode;
      if (code == null) return true;
      if (code == 429) return true;
      if (code >= 500) return true;
      return false;
    }
    return true; // network / generic
  }

  static String _snippetFor(String? textBody) {
    if (textBody == null || textBody.isEmpty) return '';
    final cleaned = textBody.replaceAll(RegExp(r'\s+'), ' ').trim();
    if (cleaned.length <= 200) return cleaned;
    return '${cleaned.substring(0, 200)}…';
  }
}

/// Riverpod accessor — composes the engine + store + controller. The
/// future resolves once the local DB has opened, which happens once
/// per app lifetime.
final mailActionsProvider = FutureProvider<MailActions>((ref) async {
  final engine = await ref.watch(syncEngineProvider.future);
  final store = await ref.watch(emailLocalStoreProvider.future);
  final repo = await ref.watch(mailRepositoryProvider.future);
  final inbox = ref.read(inboxControllerProvider.notifier);
  return MailActions(engine, store, inbox, repo);
});
