import 'dart:async';
import 'dart:convert';

import 'package:rxdart/rxdart.dart';
import 'package:sqflite/sqflite.dart';

import '../../features/mail/domain/email.dart';
import 'local_db.dart';

/// Local source of truth for emails. The UI watches `watchFolder()`;
/// the network layer + WS bridge call `upsertList`/`upsertOne`; the
/// SyncEngine + UI mutations call `applyLocalMutation`.
///
/// Last-write-wins reconciliation: server-pushed rows only override
/// the local row if their `updatedAtMs` is strictly newer. Local
/// optimistic mutations bump `updatedAtMs` to `now()` which keeps
/// them on top of any stale server snapshot until the server confirms.
class EmailLocalStore {
  EmailLocalStore(this._db);

  final LocalDb _db;

  /// Notifier per (folder) — bumping causes any active stream over
  /// that folder to re-query.
  final Map<String, BehaviorSubject<int>> _folderTicks = {};
  final BehaviorSubject<int> _allTick = BehaviorSubject<int>.seeded(0);

  /// Detail change ticks per email id — only the detail screen of a
  /// given email cares.
  final Map<String, BehaviorSubject<int>> _detailTicks = {};

  Database get _raw => _db.db;

  void _bumpFolder(String folder) {
    _folderTicks.putIfAbsent(folder, () => BehaviorSubject<int>.seeded(0));
    _folderTicks[folder]!.add((_folderTicks[folder]!.value) + 1);
    _allTick.add(_allTick.value + 1);
  }

  void _bumpDetail(String emailId) {
    _detailTicks.putIfAbsent(emailId, () => BehaviorSubject<int>.seeded(0));
    _detailTicks[emailId]!.add(_detailTicks[emailId]!.value + 1);
  }

  /// Stream the rows for a folder ordered newest-first. Re-emits
  /// whenever any mutation lands in the store.
  Stream<List<Email>> watchFolder(String folder) {
    final subject = _folderTicks.putIfAbsent(
      folder,
      () => BehaviorSubject<int>.seeded(0),
    );
    return subject.asyncMap((_) => listFolder(folder));
  }

  Stream<Email?> watchDetail(String emailId) {
    final subject = _detailTicks.putIfAbsent(
      emailId,
      () => BehaviorSubject<int>.seeded(0),
    );
    return subject.asyncMap((_) => getById(emailId));
  }

  Future<List<Email>> listFolder(String folder, {int limit = 200}) async {
    final rows = await _raw.query(
      'emails',
      where: 'folder = ?',
      whereArgs: [folder],
      orderBy: 'created_at_ms DESC',
      limit: limit,
    );
    return rows.map(_toEmail).toList(growable: false);
  }

  Future<Email?> getById(String id) async {
    final rows = await _raw.query(
      'emails',
      where: 'id = ?',
      whereArgs: [id],
      limit: 1,
    );
    if (rows.isEmpty) return null;
    return _toEmail(rows.first);
  }

  /// Bulk upsert from a server response. Each row is applied with
  /// last-write-wins against the local copy.
  Future<void> upsertList(List<Email> rows) async {
    if (rows.isEmpty) return;
    final touched = <String>{};
    await _raw.transaction((txn) async {
      for (final email in rows) {
        final folder = await _upsertInTxn(txn, email, fromServer: true);
        if (folder != null) touched.add(folder);
      }
    });
    for (final f in touched) _bumpFolder(f);
    for (final email in rows) _bumpDetail(email.id);
  }

  Future<void> upsertOne(Email email, {bool fromServer = true}) async {
    String? touchedFolder;
    await _raw.transaction((txn) async {
      touchedFolder = await _upsertInTxn(txn, email, fromServer: fromServer);
    });
    if (touchedFolder != null) _bumpFolder(touchedFolder!);
    _bumpDetail(email.id);
  }

  /// Apply a partial update from a local optimistic mutation. Bumps
  /// updatedAt to `now` so a stale server snapshot can't overwrite
  /// the user's intent.
  Future<void> applyLocalMutation({
    required String id,
    bool? isRead,
    bool? isStarred,
    String? folder,
    String? status,
    String? sendError,
  }) async {
    final existing = await getById(id);
    if (existing == null) return;
    final next = existing.copyWith(
      isRead: isRead,
      isStarred: isStarred,
      folder: folder,
    );
    final updatedAtMs = DateTime.now().millisecondsSinceEpoch;
    String? touchedFolder;
    await _raw.transaction((txn) async {
      await txn.update(
        'emails',
        {
          'is_read': next.isRead ? 1 : 0,
          'is_starred': next.isStarred ? 1 : 0,
          'folder': next.folder,
          if (status != null) 'status': status,
          if (sendError != null || (sendError == null && status != null))
            'send_error': sendError,
          'updated_at_ms': updatedAtMs,
        },
        where: 'id = ?',
        whereArgs: [id],
      );
      touchedFolder = next.folder;
    });
    if (touchedFolder != null) _bumpFolder(touchedFolder!);
    if (existing.folder != next.folder) _bumpFolder(existing.folder);
    _bumpDetail(id);
  }

  /// Drop a row from the local store. Used by hard-delete + folder
  /// moves where the row should disappear from the source folder.
  Future<void> deleteLocal(String id) async {
    final existing = await getById(id);
    if (existing == null) return;
    await _raw.delete('emails', where: 'id = ?', whereArgs: [id]);
    _bumpFolder(existing.folder);
    _bumpDetail(id);
  }

  /// Replace a row's primary key — used by the compose-as-outbox flow.
  /// We insert with a client-side temp id so the user sees the row in
  /// Sent immediately; once the server creates the real row the
  /// outbox handler swaps the local id to match. Idempotent: if the
  /// new id already exists (because a WS event landed first) we drop
  /// the temp row instead of throwing on the unique constraint.
  Future<void> swapId({required String oldId, required String newId}) async {
    if (oldId == newId) return;
    await _raw.transaction((txn) async {
      final existingNew = await txn.query(
        'emails',
        columns: ['id'],
        where: 'id = ?',
        whereArgs: [newId],
        limit: 1,
      );
      if (existingNew.isNotEmpty) {
        await txn.delete('emails', where: 'id = ?', whereArgs: [oldId]);
        return;
      }
      await txn.update(
        'emails',
        {'id': newId, 'updated_at_ms': DateTime.now().millisecondsSinceEpoch},
        where: 'id = ?',
        whereArgs: [oldId],
      );
    });
    _bumpDetail(oldId);
    _bumpDetail(newId);
    final after = await getById(newId);
    if (after != null) _bumpFolder(after.folder);
  }

  /// Persist the body + attachments after a `getById` HTTP fetch so
  /// the next open is instant.
  Future<void> updateBody({
    required String id,
    String? textBody,
    String? htmlBody,
    List<EmailAttachment>? attachments,
  }) async {
    final existing = await getById(id);
    if (existing == null) return;
    await _raw.update(
      'emails',
      {
        if (textBody != null) 'text_body': textBody,
        if (htmlBody != null) 'html_body': htmlBody,
        'attachments_json': jsonEncode(
          (attachments ?? existing.attachments)
              .map((a) => {
                    'id': a.id,
                    'filename': a.filename,
                    'contentType': a.contentType,
                    'sizeBytes': a.sizeBytes,
                  })
              .toList(),
        ),
        'detail_loaded': 1,
        'updated_at_ms': DateTime.now().millisecondsSinceEpoch,
      },
      where: 'id = ?',
      whereArgs: [id],
    );
    _bumpDetail(id);
  }

  Future<void> _ensureSubject(String folder) async {
    _folderTicks.putIfAbsent(folder, () => BehaviorSubject<int>.seeded(0));
  }

  /// Internal — must run inside a transaction. Returns the folder
  /// that was touched (so the caller can bump its tick once outside
  /// the transaction).
  Future<String?> _upsertInTxn(
    DatabaseExecutor txn,
    Email incoming, {
    required bool fromServer,
  }) async {
    final existing = await txn.query(
      'emails',
      columns: ['updated_at_ms', 'folder', 'detail_loaded'],
      where: 'id = ?',
      whereArgs: [incoming.id],
      limit: 1,
    );

    // For server-pushed rows we trust the server's updatedAt for LWW.
    // For local-only rows the caller (applyLocalMutation) bumps the
    // `updated_at_ms` column directly and never goes through this path,
    // so we don't need a fallback to `now`.
    final incomingMs = incoming.updatedAt.millisecondsSinceEpoch;
    final values = <String, Object?>{
      'id': incoming.id,
      'mailbox_id': incoming.mailboxId ?? '',
      'from_address': incoming.fromAddress,
      'to_addresses': jsonEncode(incoming.toAddresses),
      'cc': jsonEncode(incoming.cc),
      'bcc': jsonEncode(incoming.bcc),
      'subject': incoming.subject,
      'snippet': incoming.snippet,
      'folder': incoming.folder,
      'is_read': incoming.isRead ? 1 : 0,
      'is_starred': incoming.isStarred ? 1 : 0,
      'is_draft': incoming.isDraft ? 1 : 0,
      'has_attachments': incoming.hasAttachments ? 1 : 0,
      'size_bytes': incoming.sizeBytes,
      'status': incoming.status,
      'send_error': incoming.sendError,
      'updated_at_ms': incomingMs,
      'created_at_ms': incoming.createdAt.millisecondsSinceEpoch,
    };

    if (incoming.textBody != null) values['text_body'] = incoming.textBody;
    if (incoming.htmlBody != null) values['html_body'] = incoming.htmlBody;
    if (incoming.attachments.isNotEmpty) {
      values['attachments_json'] = jsonEncode(incoming.attachments
          .map((a) => {
                'id': a.id,
                'filename': a.filename,
                'contentType': a.contentType,
                'sizeBytes': a.sizeBytes,
              })
          .toList());
      values['detail_loaded'] = 1;
    }
    // Labels: persist on every upsert so cached rows render chips
    // offline. Empty lists overwrite too (label removed server-side).
    values['labels_json'] = jsonEncode(incoming.labels
        .map((l) => {'id': l.id, 'name': l.name, 'color': l.color})
        .toList());

    String? touched;
    if (existing.isEmpty) {
      await txn.insert('emails', values);
      touched = incoming.folder;
    } else {
      final existingMs = (existing.first['updated_at_ms'] as int?) ?? 0;
      // LWW reconciliation — only overwrite when the incoming row is
      // newer. The server bumps updated_at on every mutation, so a
      // stale list-page response won't clobber a freshly-flipped
      // local mutation.
      if (fromServer && incomingMs <= existingMs) {
        // No update; keep local intact. Still touch the folder index
        // so a re-fetch refreshes ordering.
        return existing.first['folder'] as String?;
      }
      await txn.update(
        'emails',
        values,
        where: 'id = ?',
        whereArgs: [incoming.id],
      );
      touched = incoming.folder;
      final prevFolder = existing.first['folder'] as String?;
      if (prevFolder != null && prevFolder != incoming.folder) {
        // Caller will bump the previous folder too.
        _scheduleFolderBump(prevFolder);
      }
    }
    await _ensureSubject(touched);
    return touched;
  }

  // Buffered list of folders touched by the most recent transaction.
  // We can't bump from inside the txn (subjects may emit during a
  // commit boundary), so we capture and replay outside.
  final List<String> _pendingFolderBumps = [];
  void _scheduleFolderBump(String folder) {
    _pendingFolderBumps.add(folder);
  }

  Email _toEmail(Map<String, Object?> row) {
    List<String> _decodeStrList(String key) {
      final raw = row[key] as String?;
      if (raw == null || raw.isEmpty) return const [];
      try {
        final list = jsonDecode(raw) as List<dynamic>;
        return list.whereType<String>().toList(growable: false);
      } catch (_) {
        return const [];
      }
    }

    List<EmailAttachment> _decodeAttachments() {
      final raw = row['attachments_json'] as String?;
      if (raw == null || raw.isEmpty) return const [];
      try {
        final list = jsonDecode(raw) as List<dynamic>;
        return list
            .whereType<Map<String, dynamic>>()
            .map((m) => EmailAttachment.fromJson(m))
            .toList(growable: false);
      } catch (_) {
        return const [];
      }
    }

    List<EmailLabelRef> _decodeLabels() {
      final raw = row['labels_json'] as String?;
      if (raw == null || raw.isEmpty) return const [];
      try {
        final list = jsonDecode(raw) as List<dynamic>;
        return list
            .whereType<Map<String, dynamic>>()
            .map((m) => EmailLabelRef.fromJson(m))
            .toList(growable: false);
      } catch (_) {
        return const [];
      }
    }

    return Email(
      id: row['id'] as String,
      fromAddress: (row['from_address'] as String?) ?? '',
      toAddresses: _decodeStrList('to_addresses'),
      cc: _decodeStrList('cc'),
      bcc: _decodeStrList('bcc'),
      subject: (row['subject'] as String?) ?? '',
      snippet: (row['snippet'] as String?) ?? '',
      textBody: row['text_body'] as String?,
      htmlBody: row['html_body'] as String?,
      folder: (row['folder'] as String?) ?? 'inbox',
      isRead: ((row['is_read'] as int?) ?? 0) == 1,
      isStarred: ((row['is_starred'] as int?) ?? 0) == 1,
      isDraft: ((row['is_draft'] as int?) ?? 0) == 1,
      hasAttachments: ((row['has_attachments'] as int?) ?? 0) == 1,
      sizeBytes: (row['size_bytes'] as int?) ?? 0,
      status: (row['status'] as String?) ?? 'idle',
      sendError: row['send_error'] as String?,
      createdAt: DateTime.fromMillisecondsSinceEpoch(
        (row['created_at_ms'] as int?) ?? 0,
      ),
      updatedAt: DateTime.fromMillisecondsSinceEpoch(
        (row['updated_at_ms'] as int?) ?? 0,
      ),
      mailboxId: (row['mailbox_id'] as String?)?.isEmpty == true
          ? null
          : row['mailbox_id'] as String?,
      attachments: _decodeAttachments(),
      labels: _decodeLabels(),
    );
  }

  Future<void> dispose() async {
    for (final s in _folderTicks.values) {
      await s.close();
    }
    for (final s in _detailTicks.values) {
      await s.close();
    }
    await _allTick.close();
  }
}
