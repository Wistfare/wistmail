import '../domain/user.dart';
import 'auth_remote_data_source.dart';

abstract class AuthRepository {
  Future<User> login({required String email, required String password});
  Future<User?> restoreSession();
  Future<void> logout();
  Future<void> deleteAccount({required String password});
}

class AuthRepositoryImpl implements AuthRepository {
  AuthRepositoryImpl(this._remote);
  final AuthRemoteDataSource _remote;

  @override
  Future<User> login({required String email, required String password}) {
    return _remote.login(email: email, password: password);
  }

  @override
  Future<User?> restoreSession() => _remote.getSession();

  @override
  Future<void> logout() => _remote.logout();

  @override
  Future<void> deleteAccount({required String password}) =>
      _remote.deleteAccount(password: password);
}
