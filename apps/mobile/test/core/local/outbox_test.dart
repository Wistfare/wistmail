import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:wistmail/core/local/local_db.dart';
import 'package:wistmail/core/local/outbox.dart';

void main() {
  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  group('Outbox', () {
    late LocalDb db;
    late Outbox outbox;

    setUp(() async {
      await LocalDb.resetForTests();
      db = await LocalDb.openInMemoryForTests();
      outbox = Outbox(db);
    });

    tearDown(() async {
      await LocalDb.resetForTests();
    });

    test('enqueue inserts a pending row', () async {
      final id = await outbox.enqueue(
        entityType: 'email',
        entityId: 'eml_1',
        op: OutboxOp.setStarred,
        payload: {'value': true},
      );
      expect(id, greaterThan(0));
      final all = await outbox.all();
      expect(all, hasLength(1));
      expect(all.first.op, OutboxOp.setStarred);
      expect(all.first.status, 'pending');
      expect(all.first.payload['value'], true);
    });

    test(
        'three rapid star toggles coalesce into one pending row with the latest payload',
        () async {
      await outbox.enqueue(
        entityType: 'email',
        entityId: 'eml_1',
        op: OutboxOp.setStarred,
        payload: {'value': true},
      );
      await outbox.enqueue(
        entityType: 'email',
        entityId: 'eml_1',
        op: OutboxOp.setStarred,
        payload: {'value': false},
      );
      await outbox.enqueue(
        entityType: 'email',
        entityId: 'eml_1',
        op: OutboxOp.setStarred,
        payload: {'value': true},
      );
      final all = await outbox.all();
      expect(all, hasLength(1), reason: 'pending coalesce key is unique');
      expect(all.first.payload['value'], true);
    });

    test(
        'archive supersedes earlier pending star/read mutations on the same email',
        () async {
      await outbox.enqueue(
        entityType: 'email',
        entityId: 'eml_2',
        op: OutboxOp.setStarred,
        payload: {'value': true},
      );
      await outbox.enqueue(
        entityType: 'email',
        entityId: 'eml_2',
        op: OutboxOp.setRead,
        payload: {'value': true},
      );
      await outbox.enqueue(
        entityType: 'email',
        entityId: 'eml_2',
        op: OutboxOp.archive,
      );
      final all = await outbox.all();
      expect(all, hasLength(1));
      expect(all.first.op, OutboxOp.archive);
    });

    test('delete supersedes archive (both share the terminal slot)', () async {
      await outbox.enqueue(
        entityType: 'email',
        entityId: 'eml_3',
        op: OutboxOp.archive,
      );
      await outbox.enqueue(
        entityType: 'email',
        entityId: 'eml_3',
        op: OutboxOp.delete,
      );
      final all = await outbox.all();
      expect(all, hasLength(1));
      expect(all.first.op, OutboxOp.delete);
    });

    test('claim is atomic — second claim of the same row returns false', () async {
      final id = await outbox.enqueue(
        entityType: 'email',
        entityId: 'eml_4',
        op: OutboxOp.setRead,
        payload: {'value': true},
      );
      expect(await outbox.claim(id), true);
      expect(await outbox.claim(id), false,
          reason: 'a row already in inflight cannot be re-claimed');
    });

    test('markRetry resets to pending with a future not_before', () async {
      final id = await outbox.enqueue(
        entityType: 'email',
        entityId: 'eml_5',
        op: OutboxOp.setRead,
        payload: {'value': true},
      );
      await outbox.claim(id);
      await outbox.markRetry(id: id, error: 'network', delayMs: 60_000);
      final all = await outbox.all();
      expect(all.first.status, 'pending');
      expect(all.first.attempts, 1);
      expect(all.first.notBeforeMs,
          greaterThan(DateTime.now().millisecondsSinceEpoch + 30_000));
    });

    test('pullDue respects not_before', () async {
      final id = await outbox.enqueue(
        entityType: 'email',
        entityId: 'eml_6',
        op: OutboxOp.setRead,
        payload: {'value': true},
      );
      await outbox.claim(id);
      await outbox.markRetry(id: id, error: 'oops', delayMs: 60_000);

      final tooEarly = await outbox.pullDue(
          DateTime.now().millisecondsSinceEpoch + 1_000);
      expect(tooEarly, isEmpty);

      final later = await outbox.pullDue(
          DateTime.now().millisecondsSinceEpoch + 120_000);
      expect(later, hasLength(1));
    });

    test('markFailed terminally pulls the row out of the dispatch loop', () async {
      final id = await outbox.enqueue(
        entityType: 'email',
        entityId: 'eml_7',
        op: OutboxOp.setRead,
        payload: {'value': true},
      );
      await outbox.markFailed(id, 'recipient bounce');
      final all = await outbox.all();
      expect(all.first.status, 'failed');
      // Failed rows are not pulled by pullDue.
      final due = await outbox.pullDue(
          DateTime.now().millisecondsSinceEpoch + 1_000_000);
      expect(due, isEmpty);
    });

    test('pendingCount counts pending + inflight + failed', () async {
      await outbox.enqueue(
        entityType: 'email',
        entityId: 'a',
        op: OutboxOp.setRead,
        payload: {'value': true},
      );
      final id = await outbox.enqueue(
        entityType: 'email',
        entityId: 'b',
        op: OutboxOp.setStarred,
        payload: {'value': true},
      );
      await outbox.claim(id);
      final id2 = await outbox.enqueue(
        entityType: 'email',
        entityId: 'c',
        op: OutboxOp.delete,
      );
      await outbox.markFailed(id2, 'gone');
      expect(await outbox.pendingCount(), 3);
    });
  });
}
