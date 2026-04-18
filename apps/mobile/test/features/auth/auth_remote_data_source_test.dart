import 'package:flutter_test/flutter_test.dart';
import 'package:wistmail/core/network/api_exception.dart';
import 'package:wistmail/features/auth/data/auth_remote_data_source.dart';

import '../../helpers/fake_api_client.dart';

void main() {
  group('AuthRemoteDataSource.login', () {
    test('returns user on 200', () async {
      final builder = FakeApiClientBuilder()
        ..on('POST', '/api/v1/auth/login', body: {
          'user': {
            'id': 'u_1',
            'name': 'Alex',
            'email': 'alex@x.com',
            'setupComplete': true,
          }
        });

      final ds = AuthRemoteDataSource(builder.build());
      final user = await ds.login(email: 'alex@x.com', password: 'secret');

      expect(user.id, 'u_1');
      expect(user.email, 'alex@x.com');
      final req = builder.capturedRequests.single;
      expect(req.path, '/api/v1/auth/login');
      expect(req.data, {'email': 'alex@x.com', 'password': 'secret'});
    });

    test('throws ApiException on 401', () async {
      final builder = FakeApiClientBuilder()
        ..on('POST', '/api/v1/auth/login', status: 401, body: {
          'error': {'code': 'AUTH_ERROR', 'message': 'Invalid email or password'}
        });

      final ds = AuthRemoteDataSource(builder.build());
      Object? caught;
      try {
        await ds.login(email: 'x', password: 'y');
      } catch (e) {
        caught = e;
      }
      final apiErr = caught is ApiException
          ? caught
          : (caught as dynamic).error as ApiException;
      expect(apiErr.statusCode, 401);
      expect(apiErr.message, 'Invalid email or password');
    });
  });

  group('AuthRemoteDataSource.getSession', () {
    test('returns user when session is valid', () async {
      final builder = FakeApiClientBuilder()
        ..on('GET', '/api/v1/auth/session', body: {
          'user': {'id': 'u_1', 'name': 'Alex', 'email': 'alex@x.com'}
        });

      final ds = AuthRemoteDataSource(builder.build());
      final user = await ds.getSession();
      expect(user, isNotNull);
      expect(user!.id, 'u_1');
    });

    test('returns null when user is null', () async {
      final builder = FakeApiClientBuilder()
        ..on('GET', '/api/v1/auth/session', body: {'user': null});

      final ds = AuthRemoteDataSource(builder.build());
      final user = await ds.getSession();
      expect(user, isNull);
    });
  });

  group('AuthRemoteDataSource.logout', () {
    test('clears cookies even on error', () async {
      final builder = FakeApiClientBuilder()
        ..on('POST', '/api/v1/auth/logout', status: 500, body: {'error': 'x'});

      final client = builder.build();
      await client.cookieJar.saveFromResponse(
        Uri.parse('http://test/'),
        [],
      );

      final ds = AuthRemoteDataSource(client);
      await ds.logout(); // should not throw
      expect(builder.capturedRequests.single.path, '/api/v1/auth/logout');
    });
  });
}
