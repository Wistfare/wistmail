import 'dart:convert';

import 'package:sqflite/sqflite.dart';

import 'local_db.dart';

/// Shape of a persisted compose-in-progress. Matches the draft the
/// compose screen operates on minus the `send` / `fromAddress`
/// fields — both of those are derived at submit time. A draft is
/// always scoped to a specific mailbox so multi-mailbox accounts
/// don't cross-contaminate.
class ComposeDraftRow {
  const ComposeDraftRow({
    required this.mailboxId,
    required this.toAddresses,
    required this.cc,
    required this.bcc,
    required this.subject,
    required this.body,
    this.inReplyTo,
    this.scheduledAt,
    required this.updatedAt,
  });

  final String mailboxId;
  final List<String> toAddresses;
  final List<String> cc;
  final List<String> bcc;
  final String subject;
  final String body;
  final String? inReplyTo;
  final DateTime? scheduledAt;
  final DateTime updatedAt;

  /// A draft is "empty enough to discard" if the user hasn't typed
  /// any recipient, subject, or body. Used as a no-op gate on save
  /// so we don't persist an empty row every few keystrokes during
  /// the initial screen-open.
  bool get isEmpty =>
      toAddresses.isEmpty &&
      cc.isEmpty &&
      bcc.isEmpty &&
      subject.trim().isEmpty &&
      body.trim().isEmpty;
}

/// SQLite-backed compose-draft cache. One row per mailbox — the
/// compose screen writes on every change (debounced), reads once on
/// open, and clears the row when the user sends or explicitly
/// discards the draft.
class ComposeDraftsStore {
  ComposeDraftsStore(this._db);
  final LocalDb _db;

  Future<ComposeDraftRow?> load(String mailboxId) async {
    final rows = await _db.db.query(
      'compose_drafts',
      where: 'mailbox_id = ?',
      whereArgs: [mailboxId],
      limit: 1,
    );
    if (rows.isEmpty) return null;
    final r = rows.first;
    List<String> decode(String key) {
      try {
        return (jsonDecode(r[key] as String) as List<dynamic>)
            .whereType<String>()
            .toList();
      } catch (_) {
        return const [];
      }
    }

    return ComposeDraftRow(
      mailboxId: r['mailbox_id'] as String,
      toAddresses: decode('to_json'),
      cc: decode('cc_json'),
      bcc: decode('bcc_json'),
      subject: (r['subject'] as String?) ?? '',
      body: (r['body'] as String?) ?? '',
      inReplyTo: r['in_reply_to'] as String?,
      scheduledAt: r['scheduled_at_ms'] == null
          ? null
          : DateTime.fromMillisecondsSinceEpoch(r['scheduled_at_ms'] as int),
      updatedAt: DateTime.fromMillisecondsSinceEpoch(
        (r['updated_at_ms'] as int?) ?? 0,
      ),
    );
  }

  Future<void> save(ComposeDraftRow row) async {
    // Empty drafts leave no row — this avoids persisting a stub the
    // moment the compose screen mounts.
    if (row.isEmpty) {
      await clear(row.mailboxId);
      return;
    }
    await _db.db.insert(
      'compose_drafts',
      {
        'mailbox_id': row.mailboxId,
        'to_json': jsonEncode(row.toAddresses),
        'cc_json': jsonEncode(row.cc),
        'bcc_json': jsonEncode(row.bcc),
        'subject': row.subject,
        'body': row.body,
        'in_reply_to': row.inReplyTo,
        'scheduled_at_ms': row.scheduledAt?.millisecondsSinceEpoch,
        'updated_at_ms': row.updatedAt.millisecondsSinceEpoch,
      },
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  Future<void> clear(String mailboxId) async {
    await _db.db.delete(
      'compose_drafts',
      where: 'mailbox_id = ?',
      whereArgs: [mailboxId],
    );
  }
}
