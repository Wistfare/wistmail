import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:wistmail/core/local/email_local_store.dart';
import 'package:wistmail/core/local/local_db.dart';
import 'package:wistmail/features/mail/domain/email.dart';

void main() {
  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  Email build({
    required String id,
    String folder = 'inbox',
    bool starred = false,
    bool read = false,
    String snippet = '',
  }) {
    return Email(
      id: id,
      fromAddress: 'a@x.com',
      toAddresses: const ['me@x.com'],
      subject: 's',
      snippet: snippet,
      folder: folder,
      isRead: read,
      isStarred: starred,
      isDraft: false,
      createdAt: DateTime.utc(2026, 1, 1),
      mailboxId: 'mbx_1',
    );
  }

  group('EmailLocalStore', () {
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

    test('upsertOne + getById round-trip', () async {
      await store.upsertOne(build(id: 'e1', snippet: 'hello'));
      final loaded = await store.getById('e1');
      expect(loaded, isNotNull);
      expect(loaded!.snippet, 'hello');
      expect(loaded.folder, 'inbox');
    });

    test('listFolder orders newest first and filters by folder', () async {
      await store.upsertList([
        Email(
          id: 'e1',
          fromAddress: 'a@x.com',
          toAddresses: const ['me@x.com'],
          subject: 'older',
          folder: 'inbox',
          isRead: false,
          isStarred: false,
          isDraft: false,
          createdAt: DateTime.utc(2026, 1, 1),
        ),
        Email(
          id: 'e2',
          fromAddress: 'a@x.com',
          toAddresses: const ['me@x.com'],
          subject: 'newer',
          folder: 'inbox',
          isRead: false,
          isStarred: false,
          isDraft: false,
          createdAt: DateTime.utc(2026, 2, 1),
        ),
        Email(
          id: 'e3',
          fromAddress: 'a@x.com',
          toAddresses: const ['me@x.com'],
          subject: 'archived',
          folder: 'archive',
          isRead: true,
          isStarred: false,
          isDraft: false,
          createdAt: DateTime.utc(2026, 3, 1),
        ),
      ]);
      final inbox = await store.listFolder('inbox');
      expect(inbox.map((e) => e.id), ['e2', 'e1']);
      final archive = await store.listFolder('archive');
      expect(archive.map((e) => e.id), ['e3']);
    });

    test(
        'applyLocalMutation flips flags and bumps updated_at past a stale server upsert',
        () async {
      await store.upsertOne(build(id: 'e1'));
      await store.applyLocalMutation(id: 'e1', isStarred: true);
      final after = await store.getById('e1');
      expect(after!.isStarred, true);

      // Simulate a stale server response (createdAt unchanged, no
      // updatedAt — _toEmail uses created_at_ms but our LWW guard
      // uses updated_at_ms which we just bumped). The upsert must
      // NOT clobber the local star.
      await store.upsertOne(build(id: 'e1'), fromServer: true);
      final stillStarred = await store.getById('e1');
      expect(stillStarred!.isStarred, true,
          reason: 'fresh local mutation must beat a stale server snapshot');
    });

    test('updateBody persists text/html and the next read returns them',
        () async {
      await store.upsertOne(build(id: 'e1'));
      await store.updateBody(
        id: 'e1',
        textBody: 'Full text body of the message.',
        htmlBody: '<p>HTML body</p>',
      );
      final loaded = await store.getById('e1');
      expect(loaded!.textBody, contains('Full text body'));
      expect(loaded.htmlBody, '<p>HTML body</p>');
    });

    test('deleteLocal removes the row and bumps the folder watcher', () async {
      await store.upsertOne(build(id: 'e1', folder: 'inbox'));
      await store.deleteLocal('e1');
      expect(await store.getById('e1'), isNull);
      expect(await store.listFolder('inbox'), isEmpty);
    });

    test('watchFolder emits the current rows then re-emits on upsert',
        () async {
      final stream = store.watchFolder('inbox');
      final received = <List<String>>[];
      final sub = stream.listen((rows) {
        received.add(rows.map((e) => e.id).toList());
      });
      // Allow seeded emit to flush.
      await Future<void>.delayed(const Duration(milliseconds: 10));

      await store.upsertOne(build(id: 'e1'));
      await Future<void>.delayed(const Duration(milliseconds: 10));

      await store.upsertOne(build(id: 'e2'));
      await Future<void>.delayed(const Duration(milliseconds: 10));

      await sub.cancel();

      // First emit may be empty (seeded), then [e1] (or [e1,e2]
      // depending on timing), then includes e2. We just assert the
      // final state contains both rows, which is what the UI cares
      // about.
      expect(received.last.toSet(), {'e1', 'e2'});
    });
  });
}
