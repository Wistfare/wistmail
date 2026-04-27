import 'package:dio/dio.dart';
import '../../../core/network/api_client.dart';
import '../domain/email.dart';
import '../domain/reply_suggestion.dart';

class MailRemoteDataSource {
  MailRemoteDataSource(this._client);
  final ApiClient _client;

  /// Fetch AI reply suggestions for an inbound email. Returns an empty
  /// list when the worker hasn't produced any (yet). The Thread screen
  /// renders nothing in that case.
  Future<List<ReplySuggestion>> getReplySuggestions(String emailId) async {
    final response = await _client.dio.get<Map<String, dynamic>>(
      '/api/v1/inbox/emails/$emailId/reply-suggestions',
    );
    final raw = (response.data?['suggestions'] as List?) ?? const [];
    return raw
        .whereType<Map<String, dynamic>>()
        .map(ReplySuggestion.fromJson)
        .toList(growable: false);
  }

  Future<EmailPage> listByFolder({
    String folder = 'inbox',
    int page = 1,
    int pageSize = 25,
  }) async {
    final response = await _client.dio.get<Map<String, dynamic>>(
      '/api/v1/inbox/emails',
      queryParameters: {
        'folder': folder,
        'page': page,
        'pageSize': pageSize,
      },
    );
    return EmailPage.fromJson(response.data!);
  }

  Future<Email> getById(String emailId) async {
    final response = await _client.dio.get<Map<String, dynamic>>(
      '/api/v1/inbox/emails/$emailId',
    );
    return Email.fromJson(response.data!);
  }

  Future<void> markRead(String emailId) async {
    await _client.dio.post<Map<String, dynamic>>(
      '/api/v1/inbox/emails/$emailId/read',
    );
  }

  Future<void> markUnread(String emailId) async {
    await _client.dio.post<Map<String, dynamic>>(
      '/api/v1/inbox/emails/$emailId/unread',
    );
  }

  Future<bool> toggleStar(String emailId) async {
    final response = await _client.dio.post<Map<String, dynamic>>(
      '/api/v1/inbox/emails/$emailId/star',
    );
    return (response.data?['starred'] as bool?) ?? false;
  }

  Future<void> archive(String emailId) async {
    await _client.dio.post<Map<String, dynamic>>(
      '/api/v1/inbox/emails/$emailId/archive',
    );
  }

  Future<void> delete(String emailId) async {
    await _client.dio.post<Map<String, dynamic>>(
      '/api/v1/inbox/emails/$emailId/delete',
    );
  }

  /// Hard-delete a single email that's already in Trash. The server
  /// 409s if the email is still in inbox/archive/etc — that's a
  /// contract mismatch the UI shouldn't reach, but we surface it as
  /// a thrown DioException so the caller can fall back to normal
  /// delete if needed.
  Future<void> purge(String emailId) async {
    await _client.dio.post<Map<String, dynamic>>(
      '/api/v1/inbox/emails/$emailId/purge',
    );
  }

  /// Empty the user's entire Trash folder. Returns the server's
  /// reported counts for telemetry / success toasts.
  Future<Map<String, int>> emptyTrash() => emptyFolder('trash');

  /// Empty any folder with a retention policy (trash or spam). The
  /// server 400s on anything else.
  Future<Map<String, int>> emptyFolder(String folder) async {
    final response = await _client.dio.post<Map<String, dynamic>>(
      '/api/v1/inbox/folders/$folder/empty',
    );
    final data = response.data ?? const <String, dynamic>{};
    return {
      'purgedEmails': (data['purgedEmails'] as num?)?.toInt() ?? 0,
      'purgedBytes': (data['purgedBytes'] as num?)?.toInt() ?? 0,
    };
  }

  /// Retention window in days. Shown on the banner for trash / spam.
  Future<int> getTrashRetention() => getFolderRetention('trash');

  Future<int> getFolderRetention(String folder) async {
    final response = await _client.dio.get<Map<String, dynamic>>(
      '/api/v1/inbox/folders/$folder/config',
    );
    return (response.data?['retentionDays'] as num?)?.toInt() ?? 30;
  }

  /// Mark every unread email in `folder` as read. Pass 'all' to clear
  /// the unread dot across every folder at once.
  Future<int> markAllRead(String folder) async {
    final response = await _client.dio.post<Map<String, dynamic>>(
      '/api/v1/inbox/folders/$folder/mark-all-read',
    );
    return (response.data?['affected'] as num?)?.toInt() ?? 0;
  }

  /// Snooze / unsnooze a single email. Passing null clears the snooze.
  Future<void> snooze(String emailId, DateTime? until) async {
    await _client.dio.post<Map<String, dynamic>>(
      '/api/v1/inbox/emails/$emailId/snooze',
      data: {'until': until?.toUtc().toIso8601String()},
    );
  }

  /// Return every email in the same thread as `emailId`, oldest
  /// first. Response payload matches the server's ThreadMessage
  /// shape — just enough for the thread strip in the detail view.
  Future<List<Map<String, dynamic>>> getThread(String emailId) async {
    final response = await _client.dio.get<Map<String, dynamic>>(
      '/api/v1/inbox/emails/$emailId/thread',
    );
    final raw = response.data?['messages'] as List<dynamic>? ?? const [];
    return raw.whereType<Map<String, dynamic>>().toList(growable: false);
  }

  /// Returns the AI's meeting extraction for an email plus the linked
  /// calendar event when one was auto-created. Null when the worker
  /// hasn't run yet for this email — the UI then renders nothing.
  Future<Map<String, dynamic>?> getMeetingExtraction(String emailId) async {
    try {
      final response = await _client.dio.get<Map<String, dynamic>>(
        '/api/v1/inbox/emails/$emailId/meeting-extraction',
      );
      return response.data;
    } on DioException catch (e) {
      if (e.response?.statusCode == 404) return null;
      rethrow;
    }
  }

  /// Accept a mid-confidence meeting suggestion. Server creates a
  /// linked calendar event and flips the extraction to outcome=2 so
  /// the chip switches to "ADDED TO CALENDAR" without a refetch.
  Future<Map<String, dynamic>> acceptMeetingExtraction(String emailId) async {
    final response = await _client.dio.post<Map<String, dynamic>>(
      '/api/v1/inbox/emails/$emailId/meeting-extraction/accept',
    );
    return response.data ?? const <String, dynamic>{};
  }

  /// Decline the meeting suggestion. Server flips outcome to -1 so
  /// the chip doesn't reappear on reopen.
  Future<void> dismissMeetingExtraction(String emailId) async {
    await _client.dio.post<Map<String, dynamic>>(
      '/api/v1/inbox/emails/$emailId/meeting-extraction/dismiss',
    );
  }

  /// Run one action against many emails in a single round-trip.
  /// `action` is one of 'read' | 'unread' | 'star' | 'unstar' |
  /// 'archive' | 'delete' | 'purge' | 'move' | 'label-add' |
  /// 'label-remove'. Extras for 'move' / label actions go in
  /// [folder] / [labelIds].
  Future<int> batchAction({
    required List<String> ids,
    required String action,
    String? folder,
    List<String>? labelIds,
  }) async {
    if (ids.isEmpty) return 0;
    final response = await _client.dio.post<Map<String, dynamic>>(
      '/api/v1/inbox/emails/batch',
      data: {
        'ids': ids,
        'action': action,
        if (folder != null) 'folder': folder,
        if (labelIds != null) 'labelIds': labelIds,
      },
    );
    return (response.data?['affected'] as num?)?.toInt() ?? 0;
  }

  Future<Map<String, int>> getUnreadCounts() async {
    final response = await _client.dio.get<Map<String, dynamic>>(
      '/api/v1/inbox/unread-counts',
    );
    final data = response.data ?? const <String, dynamic>{};
    return data.map((k, v) => MapEntry(k, (v as num).toInt()));
  }

  Future<EmailPage> search(String query) async {
    final response = await _client.dio.get<Map<String, dynamic>>(
      '/api/v1/inbox/search',
      queryParameters: {'q': query},
    );
    return EmailPage.fromJson(response.data!);
  }

  Future<String> compose(ComposeDraft draft) async {
    final response = await _client.dio.post<Map<String, dynamic>>(
      '/api/v1/inbox/compose',
      data: draft.toJson(),
    );
    return response.data!['id'] as String;
  }

  Future<void> dispatch(String emailId) async {
    await _client.dio.post<Map<String, dynamic>>(
      '/api/v1/inbox/emails/$emailId/dispatch',
    );
  }

  Future<List<Mailbox>> getMailboxes() async {
    final response = await _client.dio.get<Map<String, dynamic>>(
      '/api/v1/user/mailboxes',
    );
    final raw = response.data?['mailboxes'] as List<dynamic>? ?? const [];
    return raw.map((m) => Mailbox.fromJson(m as Map<String, dynamic>)).toList();
  }
}
