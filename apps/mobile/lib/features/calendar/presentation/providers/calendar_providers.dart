import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/network/providers.dart';
import '../../data/calendar_remote_data_source.dart';
import '../../data/calendar_repository.dart';
import '../../domain/calendar_event.dart';

final calendarRepositoryProvider = FutureProvider<CalendarRepository>((ref) async {
  final client = await ref.watch(apiClientProvider.future);
  return CalendarRepositoryImpl(CalendarRemoteDataSource(client));
});

final upcomingEventsProvider = FutureProvider<List<CalendarEvent>>((ref) async {
  final repo = await ref.watch(calendarRepositoryProvider.future);
  final now = DateTime.now();
  return repo.listEvents(
    from: now.subtract(const Duration(days: 30)),
    to: now.add(const Duration(days: 60)),
  );
});

final upcomingMeetingsProvider = FutureProvider<List<CalendarEvent>>((ref) async {
  final repo = await ref.watch(calendarRepositoryProvider.future);
  return repo.listMeetings();
});
