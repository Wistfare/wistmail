import 'package:flutter_test/flutter_test.dart';
import 'package:wistmail/features/me/domain/me_models.dart';

void main() {
  group('MeStats.fromJson', () {
    test('reads all counts', () {
      final s = MeStats.fromJson({
        'inboxUnread': 12,
        'eventsToday': 3,
        'tasksOpen': 5,
      });
      expect(s.inboxUnread, 12);
      expect(s.eventsToday, 3);
      expect(s.tasksOpen, 5);
    });

    test('defaults missing counts to zero', () {
      final s = MeStats.fromJson(const {});
      expect(s.inboxUnread, 0);
      expect(s.eventsToday, 0);
      expect(s.tasksOpen, 0);
    });
  });

  group('MePreferences.fromJson', () {
    test('parses focus mode + notification prefs', () {
      final p = MePreferences.fromJson({
        'focusModeEnabled': true,
        'focusModeUntil': '2026-04-23T20:00:00Z',
        'notificationPrefs': {'mail': false, 'chat': true, 'calendar': true},
      });
      expect(p.focusModeEnabled, isTrue);
      expect(p.focusModeUntil, isNotNull);
      expect(p.notificationPrefs.mail, isFalse);
      expect(p.notificationPrefs.chat, isTrue);
    });

    test('defaults notification channels to true', () {
      final p = MePreferences.fromJson({
        'focusModeEnabled': false,
        'focusModeUntil': null,
      });
      expect(p.notificationPrefs.mail, isTrue);
      expect(p.notificationPrefs.chat, isTrue);
      expect(p.notificationPrefs.calendar, isTrue);
    });
  });

  group('MeNotificationPrefs.copyWith', () {
    test('only overrides specified channels', () {
      const p = MeNotificationPrefs(mail: true, chat: true, calendar: true);
      final p2 = p.copyWith(chat: false);
      expect(p2.mail, isTrue);
      expect(p2.chat, isFalse);
      expect(p2.calendar, isTrue);
    });
  });
}
