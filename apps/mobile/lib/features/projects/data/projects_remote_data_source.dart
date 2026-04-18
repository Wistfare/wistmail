import '../../../core/network/api_client.dart';
import '../domain/project.dart';

class ProjectsRemoteDataSource {
  ProjectsRemoteDataSource(this._client);
  final ApiClient _client;

  Future<List<Project>> list({String? status}) async {
    final response = await _client.dio.get<Map<String, dynamic>>(
      '/api/v1/projects',
      queryParameters: {if (status != null) 'status': status},
    );
    final raw = response.data?['projects'] as List<dynamic>? ?? const [];
    return raw.map((p) => Project.fromJson(p as Map<String, dynamic>)).toList();
  }

  Future<String> create({
    required String name,
    String? description,
    List<String> memberUserIds = const [],
    DateTime? dueDate,
  }) async {
    final response = await _client.dio.post<Map<String, dynamic>>(
      '/api/v1/projects',
      data: {
        'name': name,
        if (description != null) 'description': description,
        'memberUserIds': memberUserIds,
        if (dueDate != null) 'dueDate': dueDate.toUtc().toIso8601String(),
      },
    );
    return response.data!['id'] as String;
  }
}
