import 'package:dio/dio.dart';
import '../../../core/network/api_client.dart';
import '../domain/user.dart';

class AuthRemoteDataSource {
  AuthRemoteDataSource(this._client);
  final ApiClient _client;

  Future<User> login({required String email, required String password}) async {
    final response = await _client.dio.post<Map<String, dynamic>>(
      '/api/v1/auth/login',
      data: {'email': email, 'password': password},
    );
    final data = response.data!;
    return User.fromJson(data['user'] as Map<String, dynamic>);
  }

  Future<User?> getSession() async {
    try {
      final response = await _client.dio.get<Map<String, dynamic>>(
        '/api/v1/auth/session',
      );
      final user = response.data?['user'];
      if (user == null) return null;
      return User.fromJson(user as Map<String, dynamic>);
    } on DioException {
      return null;
    }
  }

  Future<void> logout() async {
    try {
      await _client.dio.post<Map<String, dynamic>>('/api/v1/auth/logout');
    } on DioException {
      // ignore: server errors still clear local state
    }
    await _client.clearCookies();
  }

  Future<void> deleteAccount({required String password}) async {
    await _client.dio.post<Map<String, dynamic>>(
      '/api/v1/user/delete-account',
      data: {'password': password, 'confirmation': 'DELETE'},
    );
    await _client.clearCookies();
  }
}
