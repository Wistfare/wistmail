import '../../../core/network/api_client.dart';
import '../domain/email.dart';

class MailRemoteDataSource {
  MailRemoteDataSource(this._client);
  final ApiClient _client;

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
  Future<Map<String, int>> emptyTrash() async {
    final response = await _client.dio.post<Map<String, dynamic>>(
      '/api/v1/inbox/trash/empty',
    );
    final data = response.data ?? const <String, dynamic>{};
    return {
      'purgedEmails': (data['purgedEmails'] as num?)?.toInt() ?? 0,
      'purgedBytes': (data['purgedBytes'] as num?)?.toInt() ?? 0,
    };
  }

  /// Retention window in days. Shown on the trash banner.
  Future<int> getTrashRetention() async {
    final response = await _client.dio.get<Map<String, dynamic>>(
      '/api/v1/inbox/trash/config',
    );
    return (response.data?['retentionDays'] as num?)?.toInt() ?? 30;
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
