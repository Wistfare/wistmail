import 'package:flutter_test/flutter_test.dart';
import 'package:wistmail/features/auth/domain/user.dart';

void main() {
  group('User.fromJson', () {
    test('parses all fields', () {
      final user = User.fromJson({
        'id': 'u_1',
        'name': 'Alex Chen',
        'email': 'alex@wistfare.com',
        'avatarUrl': 'https://img/x.png',
        'setupComplete': true,
        'setupStep': null,
      });
      expect(user.id, 'u_1');
      expect(user.name, 'Alex Chen');
      expect(user.email, 'alex@wistfare.com');
      expect(user.avatarUrl, 'https://img/x.png');
      expect(user.setupComplete, true);
      expect(user.setupStep, null);
    });

    test('defaults setupComplete to false when missing', () {
      final user = User.fromJson({
        'id': 'u_1',
        'name': 'Alex',
        'email': 'alex@x.com',
      });
      expect(user.setupComplete, false);
    });
  });

  group('User.initials', () {
    test('returns two initials for full name', () {
      final user = User(id: 'u', name: 'Alex Chen', email: 'a@x.com');
      expect(user.initials, 'AC');
    });

    test('returns one initial for single name', () {
      final user = User(id: 'u', name: 'Alex', email: 'a@x.com');
      expect(user.initials, 'A');
    });

    test('falls back to email when name is empty', () {
      final user = User(id: 'u', name: '', email: 'zeta@x.com');
      expect(user.initials, 'Z');
    });
  });
}
