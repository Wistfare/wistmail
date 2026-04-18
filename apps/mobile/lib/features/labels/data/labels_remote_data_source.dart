import '../../../core/network/api_client.dart';
import '../domain/label.dart';

class LabelsRemoteDataSource {
  LabelsRemoteDataSource(this._client);
  final ApiClient _client;

  Future<List<EmailLabel>> listAll() async {
    final response = await _client.dio.get<Map<String, dynamic>>('/api/v1/labels');
    final raw = response.data?['labels'] as List<dynamic>? ?? const [];
    return raw.map((l) => EmailLabel.fromJson(l as Map<String, dynamic>)).toList();
  }

  Future<String> create({
    required String name,
    required String color,
    required String mailboxId,
  }) async {
    final response = await _client.dio.post<Map<String, dynamic>>(
      '/api/v1/labels',
      data: {'name': name, 'color': color, 'mailboxId': mailboxId},
    );
    return response.data!['id'] as String;
  }

  Future<List<EmailLabel>> forEmail(String emailId) async {
    final response = await _client.dio.get<Map<String, dynamic>>(
      '/api/v1/labels/email/$emailId',
    );
    final raw = response.data?['labels'] as List<dynamic>? ?? const [];
    return raw.map((l) => EmailLabel.fromJson(l as Map<String, dynamic>)).toList();
  }

  Future<void> setForEmail(String emailId, List<String> labelIds) async {
    await _client.dio.put<Map<String, dynamic>>(
      '/api/v1/labels/email/$emailId',
      data: {'labelIds': labelIds},
    );
  }
}
