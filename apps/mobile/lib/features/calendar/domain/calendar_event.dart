import 'package:flutter/material.dart';

class CalendarEvent {
  const CalendarEvent({
    required this.id,
    required this.title,
    this.description,
    this.location,
    this.attendees = const [],
    required this.startAt,
    required this.endAt,
    required this.color,
    this.meetingLink,
    this.hasWaitingRoom = false,
    this.reminderMinutes = const [15],
    this.notes,
  });

  final String id;
  final String title;
  final String? description;
  final String? location;
  final List<String> attendees;
  final DateTime startAt;
  final DateTime endAt;
  final String color;
  final String? meetingLink;
  final bool hasWaitingRoom;
  final List<int> reminderMinutes;
  final String? notes;

  factory CalendarEvent.fromJson(Map<String, dynamic> json) {
    return CalendarEvent(
      id: json['id'] as String,
      title: (json['title'] as String?) ?? '',
      description: json['description'] as String?,
      location: json['location'] as String?,
      attendees: (json['attendees'] as List<dynamic>? ?? const [])
          .whereType<String>()
          .toList(),
      startAt: DateTime.parse(json['startAt'] as String).toLocal(),
      endAt: DateTime.parse(json['endAt'] as String).toLocal(),
      color: (json['color'] as String?) ?? '#C5F135',
      meetingLink: json['meetingLink'] as String?,
      hasWaitingRoom: (json['hasWaitingRoom'] as bool?) ?? false,
      reminderMinutes: (json['reminderMinutes'] as List<dynamic>? ?? const [15])
          .map((e) => (e as num).toInt())
          .toList(),
      notes: json['notes'] as String?,
    );
  }

  bool get isMeeting => meetingLink != null && meetingLink!.isNotEmpty;

  Color get swatch {
    final hex = color.replaceFirst('#', '');
    if (hex.length != 6) return const Color(0xFFC5F135);
    return Color(int.parse('FF$hex', radix: 16));
  }

  String get timeRangeLabel => '${_fmt(startAt)} – ${_fmt(endAt)}';
}

String _fmt(DateTime d) {
  final h = d.hour == 0 ? 12 : (d.hour > 12 ? d.hour - 12 : d.hour);
  final m = d.minute.toString().padLeft(2, '0');
  final ampm = d.hour >= 12 ? 'PM' : 'AM';
  return '$h:$m $ampm';
}
