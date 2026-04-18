import '../domain/calendar_event.dart';
import 'calendar_remote_data_source.dart';

abstract class CalendarRepository {
  Future<List<CalendarEvent>> listEvents({DateTime? from, DateTime? to});
  Future<List<CalendarEvent>> listMeetings();
  Future<String> createEvent({
    required String title,
    required DateTime startAt,
    required DateTime endAt,
    String? description,
    String? location,
    List<String> attendees,
    String? color,
    String? meetingLink,
    bool? hasWaitingRoom,
    List<int>? reminderMinutes,
    String? notes,
  });
  Future<void> deleteEvent(String id);
}

class CalendarRepositoryImpl implements CalendarRepository {
  CalendarRepositoryImpl(this._remote);
  final CalendarRemoteDataSource _remote;

  @override
  Future<List<CalendarEvent>> listEvents({DateTime? from, DateTime? to}) =>
      _remote.listEvents(from: from, to: to);

  @override
  Future<List<CalendarEvent>> listMeetings() => _remote.listMeetings();

  @override
  Future<String> createEvent({
    required String title,
    required DateTime startAt,
    required DateTime endAt,
    String? description,
    String? location,
    List<String> attendees = const [],
    String? color,
    String? meetingLink,
    bool? hasWaitingRoom,
    List<int>? reminderMinutes,
    String? notes,
  }) =>
      _remote.createEvent(
        title: title,
        startAt: startAt,
        endAt: endAt,
        description: description,
        location: location,
        attendees: attendees,
        color: color,
        meetingLink: meetingLink,
        hasWaitingRoom: hasWaitingRoom,
        reminderMinutes: reminderMinutes,
        notes: notes,
      );

  @override
  Future<void> deleteEvent(String id) => _remote.deleteEvent(id);
}
