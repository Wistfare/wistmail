import '../../../core/local/outbox.dart';
import '../../../core/local/sync_engine.dart';
import '../domain/email.dart';
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
    OutboxOp.composeSend: (row, store) async {
      // First-time send of a new compose. Payload carries the full
      // draft; the local store already has a placeholder row keyed by
      // the temp id (entity_id). On success we swap the local id to
      // whatever the server assigned so subsequent WS events bind
      // correctly.
      final draft = ComposeDraft(
        fromAddress: (row.payload['fromAddress'] as String?) ?? '',
        mailboxId: (row.payload['mailboxId'] as String?) ?? '',
        toAddresses:
            (row.payload['toAddresses'] as List?)?.whereType<String>().toList() ??
                const [],
        cc: (row.payload['cc'] as List?)?.whereType<String>().toList() ??
            const [],
        bcc: (row.payload['bcc'] as List?)?.whereType<String>().toList() ??
            const [],
        subject: (row.payload['subject'] as String?) ?? '',
        textBody: row.payload['textBody'] as String?,
        htmlBody: row.payload['htmlBody'] as String?,
        send: true,
      );
      final realId = await repo.compose(draft);
      await store.swapId(oldId: row.entityId, newId: realId);
    },
  };
}
