import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:wistmail/core/local/email_local_store.dart';
import 'package:wistmail/core/local/local_db.dart';
import 'package:wistmail/core/local/outbox.dart';
import 'package:wistmail/core/local/sync_engine.dart';
import 'package:wistmail/features/mail/domain/email.dart';

void main() {
  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  Email build({required String id, String folder = 'inbox', String status = 'idle'}) {
    return Email(
      id: id,
      fromAddress: 'me@x.com',
      toAddresses: const ['to@x.com'],
      subject: 'subj',
      folder: folder,
      isRead: true,
      isStarred: false,
      isDraft: false,
      status: status,
      createdAt: DateTime.utc(2026, 1, 1),
    );
  }

  group('EmailLocalStore.swapId', () {
    late LocalDb db;
    late EmailLocalStore store;

    setUp(() async {
      await LocalDb.resetForTests();
      db = await LocalDb.openInMemoryForTests();
      store = EmailLocalStore(db);
    });

    tearDown(() async {
      await store.dispose();
      await LocalDb.resetForTests();
    });

    test('rewrites the primary key in place', () async {
      await store.upsertOne(build(id: 'local_temp', status: 'sending'));
      await store.swapId(oldId: 'local_temp', newId: 'eml_real');
      expect(await store.getById('local_temp'), isNull);
      final after = await store.getById('eml_real');
      expect(after, isNotNull);
      expect(after!.status, 'sending');
    });

    test('drops the temp row when the real id already exists (WS beat us)',
        () async {
      await store.upsertOne(build(id: 'local_temp', status: 'sending'));
      await store.upsertOne(build(id: 'eml_real', status: 'sent'));
      await store.swapId(oldId: 'local_temp', newId: 'eml_real');
      // Temp gone, real preserved with its sent state.
      expect(await store.getById('local_temp'), isNull);
      final preserved = await store.getById('eml_real');
      expect(preserved!.status, 'sent');
    });

    test('no-op when oldId == newId', () async {
      await store.upsertOne(build(id: 'eml_x'));
      await store.swapId(oldId: 'eml_x', newId: 'eml_x');
      expect(await store.getById('eml_x'), isNotNull);
    });
  });

  group('Outbox.requeue / discard', () {
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

    test('requeue resets a failed row back to pending and clears not_before',
        () async {
      final id = await outbox.enqueue(
        entityType: 'email',
        entityId: 'a',
        op: OutboxOp.setStarred,
        payload: {'value': true},
      );
      await outbox.markFailed(id, 'bounce');
      await outbox.requeue(id);
      final row = (await outbox.all()).first;
      expect(row.status, 'pending');
      expect(row.lastError, isNull);
      expect(row.notBeforeMs, 0);
    });

    test('discard removes the row entirely', () async {
      final id = await outbox.enqueue(
        entityType: 'email',
        entityId: 'b',
        op: OutboxOp.delete,
      );
      await outbox.markFailed(id, 'oops');
      await outbox.discard(id);
      expect(await outbox.all(), isEmpty);
    });
  });

  group('SyncEngine telemetry + composeSend coalesce key', () {
    late LocalDb db;
    late EmailLocalStore store;
    late Outbox outbox;
    late SyncEngine engine;
    late List<SyncTelemetryEvent> events;

    setUp(() async {
      await LocalDb.resetForTests();
      db = await LocalDb.openInMemoryForTests();
      store = EmailLocalStore(db);
      outbox = Outbox(db);
      events = [];
      engine = SyncEngine(
        outbox: outbox,
        store: store,
        drainDebounce: const Duration(milliseconds: 5),
        tickInterval: const Duration(seconds: 60),
        telemetry: events.add,
        handlers: {
          OutboxOp.composeSend: (row, _) async {
            // No-op handler — just succeeds so we can observe the
            // dispatch_ok telemetry event.
          },
          OutboxOp.setStarred: (row, _) async {},
        },
      );
    });

    tearDown(() async {
      await engine.stop();
      await LocalDb.resetForTests();
    });

    test('composeSend rows for different temp ids do not coalesce', () async {
      await engine.enqueue(
        entityType: 'email',
        entityId: 'local_a',
        op: OutboxOp.composeSend,
        payload: const {'subject': 'one'},
      );
      await engine.enqueue(
        entityType: 'email',
        entityId: 'local_b',
        op: OutboxOp.composeSend,
        payload: const {'subject': 'two'},
      );
      final all = await outbox.all();
      expect(all, hasLength(2));
    });

    test(
        'telemetry emits enqueue + dispatch_start + dispatch_ok in order on success',
        () async {
      await engine.enqueue(
        entityType: 'email',
        entityId: 'local_c',
        op: OutboxOp.composeSend,
        payload: const {'subject': 'hello'},
      );
      await engine.drainNow();
      final kinds = events.map((e) => e.kind).toList();
      expect(kinds, containsAllInOrder(['enqueue', 'dispatch_start', 'dispatch_ok']));
    });
  });
}
