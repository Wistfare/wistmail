import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:wistmail/core/local/email_local_store.dart';
import 'package:wistmail/core/local/local_db.dart';
import 'package:wistmail/core/local/outbox.dart';
import 'package:wistmail/core/local/sync_engine.dart';
import 'package:wistmail/core/network/api_exception.dart';

void main() {
  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  group('SyncEngine', () {
    late LocalDb db;
    late EmailLocalStore store;
    late Outbox outbox;
    late List<OutboxRow> seen;
    late SyncEngine engine;

    setUp(() async {
      await LocalDb.resetForTests();
      db = await LocalDb.openInMemoryForTests();
      store = EmailLocalStore(db);
      outbox = Outbox(db);
      seen = [];
      engine = SyncEngine(
        outbox: outbox,
        store: store,
        // Tight debounce so tests don't wait long.
        drainDebounce: const Duration(milliseconds: 30),
        tickInterval: const Duration(seconds: 60),
        handlers: {
          OutboxOp.setStarred: (row, _) async {
            seen.add(row);
          },
          OutboxOp.setRead: (row, _) async {
            seen.add(row);
          },
          OutboxOp.archive: (row, _) async {
            seen.add(row);
          },
          OutboxOp.delete: (row, _) async {
            seen.add(row);
          },
          OutboxOp.moveFolder: (row, _) async {
            seen.add(row);
          },
          OutboxOp.dispatchSend: (row, _) async {
            seen.add(row);
          },
        },
      );
    });

    tearDown(() async {
      await engine.stop();
      await LocalDb.resetForTests();
    });

    test('drainNow runs each pending row through its handler', () async {
      await engine.enqueue(
        entityType: 'email',
        entityId: 'a',
        op: OutboxOp.setStarred,
        payload: {'value': true},
      );
      await engine.drainNow();
      expect(seen, hasLength(1));
      expect(seen.first.entityId, 'a');
      // Successful rows are removed from the outbox.
      expect(await outbox.all(), isEmpty);
    });

    test('three rapid star toggles produce a single dispatched row', () async {
      await engine.enqueue(
        entityType: 'email',
        entityId: 'b',
        op: OutboxOp.setStarred,
        payload: {'value': true},
      );
      await engine.enqueue(
        entityType: 'email',
        entityId: 'b',
        op: OutboxOp.setStarred,
        payload: {'value': false},
      );
      await engine.enqueue(
        entityType: 'email',
        entityId: 'b',
        op: OutboxOp.setStarred,
        payload: {'value': true},
      );
      await engine.drainNow();
      expect(seen, hasLength(1),
          reason: 'coalesce + debounce should fold into one HTTP call');
      expect(seen.first.payload['value'], true,
          reason: 'final-state wins');
    });

    test('retryable failure sends the row back to pending with backoff',
        () async {
      var calls = 0;
      engine = SyncEngine(
        outbox: outbox,
        store: store,
        drainDebounce: const Duration(milliseconds: 5),
        tickInterval: const Duration(seconds: 60),
        handlers: {
          OutboxOp.setStarred: (row, _) async {
            calls++;
            throw ApiException(
              code: 'NET',
              message: 'network down',
              statusCode: 503,
            );
          },
        },
      );
      await engine.enqueue(
        entityType: 'email',
        entityId: 'c',
        op: OutboxOp.setStarred,
        payload: {'value': true},
      );
      await engine.drainNow();
      expect(calls, 1);
      final all = await outbox.all();
      expect(all, hasLength(1));
      expect(all.first.status, 'pending');
      expect(all.first.attempts, 1);
      // not_before is pushed into the future so a follow-up drain
      // doesn't immediately re-dispatch.
      expect(all.first.notBeforeMs,
          greaterThan(DateTime.now().millisecondsSinceEpoch));
    });

    test(
        'non-retryable 4xx (other than 429) hits markFailed instead of looping',
        () async {
      engine = SyncEngine(
        outbox: outbox,
        store: store,
        drainDebounce: const Duration(milliseconds: 5),
        tickInterval: const Duration(seconds: 60),
        handlers: {
          OutboxOp.setStarred: (row, _) async {
            throw ApiException(
              code: 'NOT_FOUND',
              message: 'gone',
              statusCode: 404,
            );
          },
        },
      );
      await engine.enqueue(
        entityType: 'email',
        entityId: 'd',
        op: OutboxOp.setStarred,
        payload: {'value': true},
      );
      await engine.drainNow();
      final all = await outbox.all();
      expect(all, hasLength(1));
      expect(all.first.status, 'failed');
    });

    test('429 is retried (rate-limit signal)', () async {
      var calls = 0;
      engine = SyncEngine(
        outbox: outbox,
        store: store,
        drainDebounce: const Duration(milliseconds: 5),
        tickInterval: const Duration(seconds: 60),
        handlers: {
          OutboxOp.setStarred: (row, _) async {
            calls++;
            throw ApiException(
              code: 'RATE_LIMITED',
              message: 'slow down',
              statusCode: 429,
            );
          },
        },
      );
      await engine.enqueue(
        entityType: 'email',
        entityId: 'e',
        op: OutboxOp.setStarred,
        payload: {'value': true},
      );
      await engine.drainNow();
      expect(calls, 1);
      final all = await outbox.all();
      expect(all.first.status, 'pending');
    });

    test('status stream surfaces pending count + clears it on success',
        () async {
      // Block the test until we've collected the seeded value + the
      // pending=1 emission so we don't race the stream.
      final emissions = <int>[];
      final sub = engine.status.listen((s) => emissions.add(s.pending));

      await engine.enqueue(
        entityType: 'email',
        entityId: 'f',
        op: OutboxOp.setStarred,
        payload: {'value': true},
      );
      await engine.drainNow();
      // Allow microtasks to flush.
      await Future<void>.delayed(const Duration(milliseconds: 5));
      await sub.cancel();

      // The stream must have observed the pending row at some point and
      // then cleared back to zero. We don't pin the exact emission count
      // (debounce + drain timing varies) — just the start (>=1) and
      // settle (==0) invariants.
      expect(emissions.contains(0), true);
      expect(emissions.any((n) => n >= 1), true);
      expect(emissions.last, 0);
    });
  });
}
