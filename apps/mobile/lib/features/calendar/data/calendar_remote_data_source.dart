import '../../../core/network/api_client.dart';
import '../domain/calendar_event.dart';

class CalendarRemoteDataSource {
  CalendarRemoteDataSource(this._client);
  final ApiClient _client;

  Future<List<CalendarEvent>> listEvents({DateTime? from, DateTime? to}) async {
    final response = await _client.dio.get<Map<String, dynamic>>(
      '/api/v1/calendar/events',
      queryParameters: {
        if (from != null) 'from': from.toUtc().toIso8601String(),
        if (to != null) 'to': to.toUtc().toIso8601String(),
      },
    );
    final raw = response.data?['events'] as List<dynamic>? ?? const [];
    return raw
        .map((e) => CalendarEvent.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<List<CalendarEvent>> listMeetings() async {
    final response = await _client.dio.get<Map<String, dynamic>>(
      '/api/v1/calendar/events/meetings',
    );
    final raw = response.data?['meetings'] as List<dynamic>? ?? const [];
    return raw
        .map((e) => CalendarEvent.fromJson(e as Map<String, dynamic>))
        .toList();
  }

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
  }) async {
    final response = await _client.dio.post<Map<String, dynamic>>(
      '/api/v1/calendar/events',
      data: {
        'title': title,
        'startAt': startAt.toUtc().toIso8601String(),
        'endAt': endAt.toUtc().toIso8601String(),
        if (description != null) 'description': description,
        if (location != null) 'location': location,
        'attendees': attendees,
        if (color != null) 'color': color,
        if (meetingLink != null) 'meetingLink': meetingLink,
        if (hasWaitingRoom != null) 'hasWaitingRoom': hasWaitingRoom,
        if (reminderMinutes != null) 'reminderMinutes': reminderMinutes,
        if (notes != null) 'notes': notes,
      },
    );
    return response.data!['id'] as String;
  }

  Future<void> deleteEvent(String id) async {
    await _client.dio.delete<Map<String, dynamic>>('/api/v1/calendar/events/$id');
  }
}
