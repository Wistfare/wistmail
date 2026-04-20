import 'dart:async';
import 'dart:convert';

import 'package:sqflite/sqflite.dart';

import 'local_db.dart';

/// Concrete operations the outbox knows how to dispatch. Each value
/// matches a single HTTP endpoint shape — see SyncEngine._dispatch.
enum OutboxOp {
  /// `set_state` ops are coalesced by entity+field — the latest desired
  /// value wins, so rapid star/unstar/star ends up as one HTTP call.
  setStarred,
  setRead,
  /// `move_folder` is also `set_state` — payload carries the target.
  moveFolder,
  /// Terminal — supersedes every other pending op for the entity.
  delete,
  archive,
  /// One-shot dispatch of a queued draft. Never coalesced with itself
  /// (we only allow one in-flight send per draft id).
  dispatchSend,
}

extension OutboxOpExt on OutboxOp {
  String get wireName {
    switch (this) {
      case OutboxOp.setStarred:
        return 'set_starred';
      case OutboxOp.setRead:
        return 'set_read';
      case OutboxOp.moveFolder:
        return 'move_folder';
      case OutboxOp.delete:
        return 'delete';
      case OutboxOp.archive:
        return 'archive';
      case OutboxOp.dispatchSend:
        return 'dispatch_send';
    }
  }

  /// Coalesce-key suffix per op. The full key is
  /// `{entityType}:{entityId}:{suffix}` and is enforced unique on
  /// pending rows by the partial index in local_db.dart.
  ///
  /// Terminal ops share the suffix `terminal` so any pending non-
  /// terminal mutation is overwritten when a delete lands.
  String coalesceSuffix(String entityId) {
    switch (this) {
      case OutboxOp.setStarred:
        return 'starred';
      case OutboxOp.setRead:
        return 'read';
      case OutboxOp.moveFolder:
        return 'folder';
      case OutboxOp.delete:
      case OutboxOp.archive:
        // Both terminal — share the slot so back-to-back archive then
        // delete collapses to the latest intent.
        return 'terminal';
      case OutboxOp.dispatchSend:
        // One-in-flight per draft; not coalesced with anything else.
        return 'send:$entityId';
    }
  }

  static OutboxOp? fromWire(String wire) {
    for (final op in OutboxOp.values) {
      if (op.wireName == wire) return op;
    }
    return null;
  }
}

/// One row in the outbox. Construct via `Outbox.enqueue` rather than
/// instantiating directly so the coalesce key is always derived
/// consistently.
class OutboxRow {
  OutboxRow({
    required this.id,
    required this.entityType,
    required this.entityId,
    required this.op,
    required this.payload,
    required this.attempts,
    required this.lastError,
    required this.status,
    required this.createdAtMs,
    required this.notBeforeMs,
  });

  final int id;
  final String entityType;
  final String entityId;
  final OutboxOp op;
  final Map<String, Object?> payload;
  final int attempts;
  final String? lastError;
  final String status; // 'pending' | 'inflight' | 'failed'
  final int createdAtMs;
  final int notBeforeMs;

  static OutboxRow fromMap(Map<String, Object?> row) {
    final op = OutboxOpExt.fromWire(row['op'] as String);
    if (op == null) {
      throw StateError('Unknown outbox op: ${row['op']}');
    }
    final raw = (row['payload'] as String?) ?? '{}';
    Map<String, Object?> payload;
    try {
      payload = (jsonDecode(raw) as Map).cast<String, Object?>();
    } catch (_) {
      payload = const {};
    }
    return OutboxRow(
      id: row['id'] as int,
      entityType: row['entity_type'] as String,
      entityId: row['entity_id'] as String,
      op: op,
      payload: payload,
      attempts: (row['attempts'] as int?) ?? 0,
      lastError: row['last_error'] as String?,
      status: (row['status'] as String?) ?? 'pending',
      createdAtMs: (row['created_at_ms'] as int?) ?? 0,
      notBeforeMs: (row['not_before_ms'] as int?) ?? 0,
    );
  }
}

/// DAO for the outbox table. Pure storage operations — the dispatch
/// loop lives in SyncEngine.
class Outbox {
  Outbox(this._db);

  final LocalDb _db;
  Database get _raw => _db.db;

  /// Enqueue a mutation. Coalesces against any existing pending row
  /// with the same coalesce key — the new payload replaces the old
  /// one and the attempts counter resets. This is what lets five
  /// taps on the star button become one HTTP call.
  ///
  /// Terminal ops (delete/archive) additionally drop every other
  /// pending row for the entity.
  Future<int> enqueue({
    required String entityType,
    required String entityId,
    required OutboxOp op,
    Map<String, Object?> payload = const {},
  }) async {
    final coalesceKey =
        '$entityType:$entityId:${op.coalesceSuffix(entityId)}';
    final nowMs = DateTime.now().millisecondsSinceEpoch;
    return _raw.transaction<int>((txn) async {
      // Terminal ops nuke any earlier pending mutation for the entity.
      if (op == OutboxOp.delete || op == OutboxOp.archive) {
        await txn.delete(
          'outbox',
          where: 'entity_type = ? AND entity_id = ? AND status = ?',
          whereArgs: [entityType, entityId, 'pending'],
        );
      }

      final existing = await txn.query(
        'outbox',
        where: 'coalesce_key = ? AND status = ?',
        whereArgs: [coalesceKey, 'pending'],
        limit: 1,
      );

      if (existing.isNotEmpty) {
        final id = existing.first['id'] as int;
        await txn.update(
          'outbox',
          {
            'payload': jsonEncode(payload),
            'attempts': 0,
            'last_error': null,
            'not_before_ms': 0,
            'created_at_ms': nowMs,
          },
          where: 'id = ?',
          whereArgs: [id],
        );
        return id;
      }

      return txn.insert('outbox', {
        'entity_type': entityType,
        'entity_id': entityId,
        'op': op.wireName,
        'payload': jsonEncode(payload),
        'coalesce_key': coalesceKey,
        'attempts': 0,
        'status': 'pending',
        'created_at_ms': nowMs,
        'not_before_ms': 0,
      });
    });
  }

  /// Pull the next batch of rows ready to dispatch. `nowMs` is
  /// parameterized so tests can drive the clock.
  Future<List<OutboxRow>> pullDue(int nowMs, {int limit = 20}) async {
    final rows = await _raw.query(
      'outbox',
      where: 'status = ? AND not_before_ms <= ?',
      whereArgs: ['pending', nowMs],
      orderBy: 'created_at_ms ASC',
      limit: limit,
    );
    return rows.map(OutboxRow.fromMap).toList(growable: false);
  }

  /// Atomically claim a row — returns true if this caller won the race.
  /// The dispatcher always claims before running so two engines (e.g.
  /// after an in-test reset that didn't fully tear down) can't
  /// double-dispatch.
  Future<bool> claim(int id) async {
    final updated = await _raw.update(
      'outbox',
      {'status': 'inflight'},
      where: 'id = ? AND status = ?',
      whereArgs: [id, 'pending'],
    );
    return updated == 1;
  }

  /// Mark a row complete and remove it.
  Future<void> ackSuccess(int id) async {
    await _raw.delete('outbox', where: 'id = ?', whereArgs: [id]);
  }

  /// Hand a row back to pending after a retryable failure. `delayMs`
  /// is the backoff window — the row won't be picked up again until
  /// `now + delayMs`. Atomic-increment of attempts via raw SQL.
  Future<void> markRetry({
    required int id,
    required String error,
    required int delayMs,
  }) async {
    final notBefore = DateTime.now().millisecondsSinceEpoch + delayMs;
    await _raw.rawUpdate(
      '''
      UPDATE outbox
         SET status = 'pending',
             last_error = ?,
             attempts = attempts + 1,
             not_before_ms = ?
       WHERE id = ?
      ''',
      [error, notBefore, id],
    );
  }

  /// Mark a row terminally failed — the dispatcher will skip it from
  /// here on. Surfaces in the Pending Sync inspector.
  Future<void> markFailed(int id, String error) async {
    await _raw.rawUpdate(
      '''
      UPDATE outbox
         SET status = 'failed',
             last_error = ?,
             attempts = attempts + 1
       WHERE id = ?
      ''',
      [error, id],
    );
  }

  /// Total number of unsynced (pending + inflight + failed) rows.
  /// Powers the "X unsynced" pill in the UI.
  Future<int> pendingCount() async {
    final rows = await _raw.rawQuery(
      "SELECT COUNT(*) AS n FROM outbox WHERE status IN ('pending','inflight','failed')",
    );
    return (rows.first['n'] as int?) ?? 0;
  }

  /// Test/inspector helper.
  Future<List<OutboxRow>> all() async {
    final rows = await _raw.query('outbox', orderBy: 'created_at_ms ASC');
    return rows.map(OutboxRow.fromMap).toList(growable: false);
  }

}
