import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/wm_bottom_nav.dart';
import '../../domain/calendar_event.dart';
import '../providers/calendar_providers.dart';

class CalendarScreen extends ConsumerStatefulWidget {
  const CalendarScreen({super.key});

  @override
  ConsumerState<CalendarScreen> createState() => _CalendarScreenState();
}

class _CalendarScreenState extends ConsumerState<CalendarScreen> {
  late DateTime _selected;

  @override
  void initState() {
    super.initState();
    _selected = DateTime.now();
  }

  @override
  Widget build(BuildContext context) {
    final events = ref.watch(upcomingEventsProvider);
    final monthLabel =
        '${_monthName(_selected.month)} ${_selected.year}';

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.background,
        automaticallyImplyLeading: false,
        titleSpacing: 16,
        title: Row(
          children: [
            Text(
              monthLabel,
              style: GoogleFonts.inter(
                fontSize: 20,
                fontWeight: FontWeight.bold,
                color: AppColors.textPrimary,
              ),
            ),
            const SizedBox(width: 4),
            const Icon(Icons.keyboard_arrow_down, color: AppColors.textSecondary),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => setState(() => _selected = DateTime.now()),
            child: Text(
              'Today',
              style: GoogleFonts.inter(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: AppColors.accent,
              ),
            ),
          ),
          IconButton(
            icon: const Icon(Icons.add, color: AppColors.accent),
            onPressed: () => context.push('/calendar/new'),
          ),
        ],
      ),
      body: Column(
        children: [
          _MonthGrid(selected: _selected, onPick: (d) => setState(() => _selected = d)),
          const Divider(height: 1, color: AppColors.border),
          Expanded(
            child: events.when(
              data: (list) => _EventsForDay(events: list, day: _selected),
              loading: () => const Center(
                child: SizedBox(
                  width: 24,
                  height: 24,
                  child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.accent),
                ),
              ),
              error: (err, _) => Center(
                child: Padding(
                  padding: const EdgeInsets.all(32),
                  child: Text(
                    err.toString(),
                    style: GoogleFonts.inter(color: AppColors.textSecondary, fontSize: 13),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
      bottomNavigationBar: const WmBottomNav(currentIndex: 2),
    );
  }
}

class _MonthGrid extends StatelessWidget {
  const _MonthGrid({required this.selected, required this.onPick});
  final DateTime selected;
  final ValueChanged<DateTime> onPick;

  @override
  Widget build(BuildContext context) {
    final firstOfMonth = DateTime(selected.year, selected.month, 1);
    final firstWeekday = firstOfMonth.weekday; // 1=Mon
    final daysInMonth = DateUtils.getDaysInMonth(selected.year, selected.month);
    final days = <DateTime?>[];
    for (int i = 1; i < firstWeekday; i++) {
      days.add(null);
    }
    for (int d = 1; d <= daysInMonth; d++) {
      days.add(DateTime(selected.year, selected.month, d));
    }
    while (days.length % 7 != 0) {
      days.add(null);
    }

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
                .map((d) => Text(
                      d,
                      style: GoogleFonts.inter(
                        fontSize: 11,
                        color: AppColors.textTertiary,
                      ),
                    ))
                .toList(),
          ),
          const SizedBox(height: 8),
          ...List.generate(days.length ~/ 7, (row) {
            return Row(
              children: List.generate(7, (col) {
                final day = days[row * 7 + col];
                return Expanded(
                  child: AspectRatio(
                    aspectRatio: 1.2,
                    child: day == null
                        ? const SizedBox.shrink()
                        : _DayCell(
                            day: day,
                            isSelected: day.year == selected.year &&
                                day.month == selected.month &&
                                day.day == selected.day,
                            onTap: () => onPick(day),
                          ),
                  ),
                );
              }),
            );
          }),
        ],
      ),
    );
  }
}

class _DayCell extends StatelessWidget {
  const _DayCell({required this.day, required this.isSelected, required this.onTap});
  final DateTime day;
  final bool isSelected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.all(2),
        decoration: BoxDecoration(
          color: isSelected ? AppColors.accent : Colors.transparent,
          borderRadius: BorderRadius.circular(6),
        ),
        alignment: Alignment.center,
        child: Text(
          '${day.day}',
          style: GoogleFonts.inter(
            fontSize: 13,
            fontWeight: isSelected ? FontWeight.w700 : FontWeight.normal,
            color: isSelected ? AppColors.background : AppColors.textPrimary,
          ),
        ),
      ),
    );
  }
}

class _EventsForDay extends StatelessWidget {
  const _EventsForDay({required this.events, required this.day});
  final List<CalendarEvent> events;
  final DateTime day;

  @override
  Widget build(BuildContext context) {
    final matching = events.where((e) =>
        e.startAt.year == day.year &&
        e.startAt.month == day.month &&
        e.startAt.day == day.day).toList();

    if (matching.isEmpty) {
      return Center(
        child: Text(
          'No events on ${_monthName(day.month)} ${day.day}',
          style: GoogleFonts.inter(fontSize: 13, color: AppColors.textSecondary),
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
      itemCount: matching.length + 1,
      itemBuilder: (context, index) {
        if (index == 0) {
          return Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Text(
              'SCHEDULE — ${_monthName(day.month).toUpperCase().substring(0, 3)} ${day.day}',
              style: GoogleFonts.inter(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: AppColors.textSecondary,
                letterSpacing: 0.8,
              ),
            ),
          );
        }
        final event = matching[index - 1];
        return Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(width: 3, height: 56, color: event.swatch),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      event.title,
                      style: GoogleFonts.inter(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: AppColors.textPrimary,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      event.timeRangeLabel,
                      style: GoogleFonts.inter(fontSize: 12, color: AppColors.textSecondary),
                    ),
                    if (event.attendees.isNotEmpty)
                      Text(
                        event.attendees.take(3).join(', ') +
                            (event.attendees.length > 3 ? ' +${event.attendees.length - 3}' : ''),
                        style: GoogleFonts.inter(fontSize: 12, color: AppColors.textSecondary),
                      ),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

String _monthName(int m) {
  const names = [
    '', 'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return names[m];
}
