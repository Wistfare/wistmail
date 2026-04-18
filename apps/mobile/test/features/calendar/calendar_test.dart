import 'package:flutter_test/flutter_test.dart';
import 'package:wistmail/features/calendar/data/calendar_remote_data_source.dart';
import 'package:wistmail/features/calendar/domain/calendar_event.dart';

import '../../helpers/fake_api_client.dart';

Map<String, dynamic> _event({String id = 'e1', String? meetingLink}) => {
      'id': id,
      'title': 'Sprint Planning',
      'description': null,
      'location': 'Room A',
      'attendees': ['alex@x.com'],
      'startAt': '2026-04-16T09:00:00Z',
      'endAt': '2026-04-16T10:00:00Z',
      'color': '#C5F135',
      'meetingLink': meetingLink,
      'hasWaitingRoom': false,
      'reminderMinutes': [15],
      'notes': null,
    };

void main() {
  group('CalendarEvent', () {
    test('parses event and detects meeting', () {
      final e1 = CalendarEvent.fromJson(_event());
      expect(e1.id, 'e1');
      expect(e1.isMeeting, false);
      final e2 = CalendarEvent.fromJson(_event(meetingLink: 'https://meet.wistfare.com/e1'));
      expect(e2.isMeeting, true);
    });

    test('swatch parses hex colour', () {
      final e = CalendarEvent.fromJson(_event());
      expect(e.swatch.toARGB32().toRadixString(16), 'ffc5f135');
    });
  });

  group('CalendarRemoteDataSource', () {
    test('listEvents sends from/to and parses events', () async {
      final builder = FakeApiClientBuilder()
        ..on('GET', '/api/v1/calendar/events', body: {
          'events': [_event(id: 'e1'), _event(id: 'e2', meetingLink: 'https://meet/abc')],
        });

      final ds = CalendarRemoteDataSource(builder.build());
      final from = DateTime.utc(2026, 1, 1);
      final to = DateTime.utc(2026, 12, 31);
      final events = await ds.listEvents(from: from, to: to);

      expect(events.length, 2);
      final req = builder.capturedRequests.single;
      expect(req.queryParameters['from'], from.toIso8601String());
      expect(req.queryParameters['to'], to.toIso8601String());
    });

    test('listMeetings parses meetings envelope', () async {
      final builder = FakeApiClientBuilder()
        ..on('GET', '/api/v1/calendar/events/meetings', body: {
          'meetings': [_event(meetingLink: 'https://meet/abc')],
        });

      final ds = CalendarRemoteDataSource(builder.build());
      final meetings = await ds.listMeetings();
      expect(meetings.length, 1);
      expect(meetings.first.isMeeting, true);
    });

    test('createEvent posts JSON and returns id', () async {
      final builder = FakeApiClientBuilder()
        ..on('POST', '/api/v1/calendar/events', status: 201, body: {'id': 'evt_new'});

      final ds = CalendarRemoteDataSource(builder.build());
      final now = DateTime.utc(2026, 4, 16, 9);
      final id = await ds.createEvent(
        title: 'Sync',
        startAt: now,
        endAt: now.add(const Duration(hours: 1)),
        meetingLink: 'generate',
      );
      expect(id, 'evt_new');
      final data = builder.capturedRequests.single.data as Map;
      expect(data['title'], 'Sync');
      expect(data['meetingLink'], 'generate');
    });
  });
}
