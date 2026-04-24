import 'package:flutter_test/flutter_test.dart';
import 'package:wistmail/features/today/domain/today_summary.dart';

void main() {
  group('TodaySummary.fromJson', () {
    test('parses a full payload', () {
      final s = TodaySummary.fromJson({
        'nextUp': {
          'id': 'evt_1',
          'title': 'Design review',
          'startAt': '2026-04-23T10:00:00Z',
          'endAt': '2026-04-23T10:30:00Z',
          'attendees': ['a@x.com', 'b@x.com'],
          'meetingLink': 'https://meet.x/1',
        },
        'needsReply': [
          {
            'id': 'em_1',
            'subject': 'Storyboard tweaks',
            'fromAddress': 'Sarah <sarah@x.com>',
            'createdAt': '2026-04-23T09:00:00Z',
            'needsReplyReason': 'open question',
          },
        ],
        'schedule': [
          {
            'id': 'evt_2',
            'title': 'Lunch',
            'startAt': '2026-04-23T13:00:00Z',
            'endAt': '2026-04-23T14:00:00Z',
            'location': 'Blue Bottle',
            'attendees': ['c@x.com'],
          },
        ],
        'recentActivity': [
          {
            'projectId': 'prj_1',
            'projectName': 'Wistmail v2',
            'taskId': 'tsk_1',
            'taskTitle': 'Ship inbox V3',
            'status': 'done',
            'updatedAt': '2026-04-23T08:00:00Z',
          },
        ],
      });
      expect(s.isEmpty, isFalse);
      expect(s.nextUp, isNotNull);
      expect(s.nextUp!.meetingLink, 'https://meet.x/1');
      expect(s.nextUp!.attendees, hasLength(2));
      expect(s.needsReply.single.emailId, 'em_1');
      expect(s.needsReply.single.reason, 'open question');
      expect(s.schedule.single.location, 'Blue Bottle');
      expect(s.recentActivity.single.status, 'done');
    });

    test('treats null nextUp + empty lists as empty', () {
      final s = TodaySummary.fromJson({
        'nextUp': null,
        'needsReply': <dynamic>[],
        'schedule': <dynamic>[],
        'recentActivity': <dynamic>[],
      });
      expect(s.isEmpty, isTrue);
    });

    test('tolerates missing keys entirely', () {
      final s = TodaySummary.fromJson(const {});
      expect(s.isEmpty, isTrue);
      expect(s.needsReply, isEmpty);
    });

    test('minutesUntilStart is negative when already started', () {
      final past = DateTime.now().subtract(const Duration(minutes: 5));
      final n = TodayNextUp.fromJson({
        'id': 'e',
        'title': 't',
        'startAt': past.toIso8601String(),
        'endAt': past.add(const Duration(hours: 1)).toIso8601String(),
        'attendees': [],
      });
      expect(n.minutesUntilStart, lessThanOrEqualTo(0));
    });
  });
}
