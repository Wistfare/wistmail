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

  Future<List<Mailbox>> getMailboxes() async {
    final response = await _client.dio.get<Map<String, dynamic>>(
      '/api/v1/user/mailboxes',
    );
    final raw = response.data?['mailboxes'] as List<dynamic>? ?? const [];
    return raw.map((m) => Mailbox.fromJson(m as Map<String, dynamic>)).toList();
  }
}
