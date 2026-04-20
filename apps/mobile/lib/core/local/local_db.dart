import 'dart:async';

import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:sqflite/sqflite.dart';

/// On-device SQLite for the offline-first store.
///
/// Tables:
///   • `emails`  — local copy of every email row the user has seen.
///                 Survives kill-restart, drives the inbox stream.
///   • `outbox`  — pending mutations waiting on the SyncEngine. The
///                 partial unique index on (coalesce_key) WHERE
///                 status='pending' enforces "one pending op per
///                 (entity, op-class)" at the storage layer so a
///                 burst of star toggles converges to a single row.
///
/// Schema migrations:
///   • Use `_kSchemaVersion` to bump and add a branch in
///     `_onUpgrade`. We start at 1; never edit prior CREATE statements.
class LocalDb {
  LocalDb._(this.db);

  final Database db;

  static const _kSchemaVersion = 1;
  static const _kFileName = 'wistfare-mail-local.db';

  static LocalDb? _instance;
  static Future<LocalDb>? _opening;

  static Future<LocalDb> open() async {
    if (_instance != null) return _instance!;
    _opening ??= _openOnce();
    return _opening!;
  }

  static Future<LocalDb> _openOnce() async {
    final dir = await getApplicationSupportDirectory();
    final path = p.join(dir.path, _kFileName);
    final db = await openDatabase(
      path,
      version: _kSchemaVersion,
      onCreate: _onCreate,
      onUpgrade: _onUpgrade,
      onConfigure: (db) async {
        await db.execute('PRAGMA foreign_keys = ON');
        // WAL gives us readers + writers without blocking — the
        // SyncEngine reads while the UI writes.
        await db.execute('PRAGMA journal_mode = WAL');
      },
    );
    final wrapped = LocalDb._(db);
    _instance = wrapped;
    return wrapped;
  }

  /// Test-only — close + drop the singleton so a new test gets a
  /// fresh in-memory DB.
  static Future<void> resetForTests() async {
    final inst = _instance;
    if (inst != null) {
      await inst.db.close();
      _instance = null;
      _opening = null;
    }
  }

  /// Test-only — open an in-memory DB with the production schema. The
  /// caller is responsible for installing an FFI factory if running
  /// off-device (sqflite_common_ffi.sqfliteFfiInit + databaseFactory =
  /// databaseFactoryFfi). See test/core/local/*.dart.
  static Future<LocalDb> openInMemoryForTests() async {
    final db = await databaseFactory.openDatabase(
      inMemoryDatabasePath,
      options: OpenDatabaseOptions(
        version: _kSchemaVersion,
        onConfigure: (db) async {
          await db.execute('PRAGMA foreign_keys = ON');
        },
        onCreate: _onCreate,
      ),
    );
    final wrapped = LocalDb._(db);
    _instance = wrapped;
    return wrapped;
  }

  /// Force the singleton to a specific instance — used by tests that
  /// pre-seed an in-memory DB and want app code to see it.
  static void registerForTests(LocalDb instance) {
    _instance = instance;
  }
}

Future<void> _onCreate(Database db, int version) async {
  await _createSchema(db);
}

Future<void> _onUpgrade(Database db, int from, int to) async {
  // No legacy versions yet. When we bump _kSchemaVersion, append
  // branches here. Never edit a prior branch.
  if (from < 1) await _createSchema(db);
}

Future<void> _createSchema(Database db) async {
  await db.execute('''
    CREATE TABLE IF NOT EXISTS emails (
      id TEXT PRIMARY KEY,
      mailbox_id TEXT NOT NULL,
      from_address TEXT NOT NULL DEFAULT '',
      to_addresses TEXT NOT NULL DEFAULT '[]',
      cc TEXT NOT NULL DEFAULT '[]',
      bcc TEXT NOT NULL DEFAULT '[]',
      subject TEXT NOT NULL DEFAULT '',
      snippet TEXT NOT NULL DEFAULT '',
      text_body TEXT,
      html_body TEXT,
      folder TEXT NOT NULL DEFAULT 'inbox',
      is_read INTEGER NOT NULL DEFAULT 0,
      is_starred INTEGER NOT NULL DEFAULT 0,
      is_draft INTEGER NOT NULL DEFAULT 0,
      has_attachments INTEGER NOT NULL DEFAULT 0,
      size_bytes INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'idle',
      send_error TEXT,
      attachments_json TEXT NOT NULL DEFAULT '[]',
      updated_at_ms INTEGER NOT NULL,
      created_at_ms INTEGER NOT NULL,
      detail_loaded INTEGER NOT NULL DEFAULT 0
    )
  ''');
  await db.execute(
      'CREATE INDEX IF NOT EXISTS emails_folder_created_idx ON emails(folder, created_at_ms DESC)');
  await db.execute(
      'CREATE INDEX IF NOT EXISTS emails_mailbox_idx ON emails(mailbox_id)');
  await db.execute(
      'CREATE INDEX IF NOT EXISTS emails_status_idx ON emails(status)');

  await db.execute('''
    CREATE TABLE IF NOT EXISTS outbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      op TEXT NOT NULL,
      payload TEXT NOT NULL DEFAULT '{}',
      coalesce_key TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at_ms INTEGER NOT NULL,
      not_before_ms INTEGER NOT NULL DEFAULT 0
    )
  ''');
  await db.execute(
      'CREATE INDEX IF NOT EXISTS outbox_status_not_before_idx ON outbox(status, not_before_ms)');
  // Partial unique index — at most one pending row per coalesce key.
  // The coalesce-on-insert path uses ON CONFLICT against this index.
  await db.execute('''
    CREATE UNIQUE INDEX IF NOT EXISTS outbox_coalesce_pending_idx
      ON outbox(coalesce_key)
      WHERE status = 'pending'
  ''');
}

