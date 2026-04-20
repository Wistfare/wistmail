import '../../../core/local/outbox.dart';
import '../../../core/local/sync_engine.dart';
import 'mail_repository.dart';

/// Concrete OutboxHandler implementations. Each takes the row's payload
/// and translates it into a single HTTP call against MailRepository.
///
/// Failures bubble up (ApiException for 4xx/5xx, generic for network).
/// SyncEngine classifies them into retry vs failed.
Map<OutboxOp, OutboxHandler> buildMailHandlers(MailRepository repo) {
  return {
    OutboxOp.setStarred: (row, store) async {
      // Toggle endpoint returns the new server-side value. We only call
      // it if the server's current state differs from what the user
      // wanted — the toggle endpoint flips state, so calling twice is a
      // no-op but burns an HTTP call.
      final desired = row.payload['value'] == true;
      final current = await store.getById(row.entityId);
      if (current?.isStarred == desired) return;
      await repo.toggleStar(row.entityId);
    },
    OutboxOp.setRead: (row, store) async {
      final desired = row.payload['value'] == true;
      final current = await store.getById(row.entityId);
      if (current?.isRead == desired) return;
      if (desired) {
        await repo.markRead(row.entityId);
      } else {
        await repo.markUnread(row.entityId);
      }
    },
    OutboxOp.archive: (row, store) async {
      await repo.archive(row.entityId);
      await store.applyLocalMutation(id: row.entityId, folder: 'archive');
    },
    OutboxOp.delete: (row, store) async {
      await repo.delete(row.entityId);
      await store.applyLocalMutation(id: row.entityId, folder: 'trash');
    },
    OutboxOp.moveFolder: (row, store) async {
      // TODO: wire when MailRepository exposes generic moveToFolder.
      // For now archive/delete cover the two folders the UI uses.
      throw UnimplementedError('move_folder not wired');
    },
    OutboxOp.dispatchSend: (row, store) async {
      // User-initiated retry of a failed/rate-limited send. Backend
      // transitions the email to 'sending' and the WS event flips
      // the row's pill once delivery resolves.
      await repo.dispatch(row.entityId);
    },
  };
}
