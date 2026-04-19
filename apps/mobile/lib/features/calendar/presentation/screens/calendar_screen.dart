import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../../core/widgets/wm_bottom_nav.dart';
import '../../domain/calendar_event.dart';
import '../providers/calendar_providers.dart';

/// Mobile/Calendar — design.lib.pen node `J6IWw`. Sharp lime square day
/// for selected day, mono day-of-week labels, schedule list with colored
/// accent bar on the left.
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

    return Scaffold(
      backgroundColor: AppColors.background,
      body: Column(
        children: [
          _TopBar(
            selected: _selected,
            onToday: () => setState(() => _selected = DateTime.now()),
            onNew: () => context.push('/calendar/new'),
          ),
          _MonthGrid(
            selected: _selected,
            onPick: (d) => setState(() => _selected = d),
          ),
          const Divider(color: AppColors.border, height: 1),
          Expanded(
            child: events.when(
              data: (list) => _EventsForDay(events: list, day: _selected),
              loading: () => const Center(
                child: SizedBox(
                  width: 22,
                  height: 22,
                  child: CircularProgressIndicator(
                      strokeWidth: 2, color: AppColors.accent),
                ),
              ),
              error: (err, _) => Center(
                child: Padding(
                  padding: const EdgeInsets.all(32),
                  child: Text(err.toString(), style: AppTextStyles.bodySmall),
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

class _TopBar extends StatelessWidget {
  const _TopBar({
    required this.selected,
    required this.onToday,
    required this.onNew,
  });
  final DateTime selected;
  final VoidCallback onToday;
  final VoidCallback onNew;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      bottom: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 8, 8, 12),
        child: Row(
          children: [
            Text('${_monthName(selected.month)} ${selected.year}',
                style: AppTextStyles.titleLarge),
            const SizedBox(width: 4),
            const Icon(Icons.keyboard_arrow_up,
                color: AppColors.textSecondary, size: 18),
            const Spacer(),
            TextButton(
              onPressed: onToday,
              child: Text(
                'Today',
                style: GoogleFonts.jetBrainsMono(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: AppColors.accent,
                ),
              ),
            ),
            IconButton(
              splashRadius: 22,
              icon: const Icon(Icons.add, size: 22),
              color: AppColors.accent,
              onPressed: onNew,
            ),
          ],
        ),
      ),
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
    final firstWeekday = firstOfMonth.weekday;
    final daysInMonth =
        DateUtils.getDaysInMonth(selected.year, selected.month);
    final today = DateTime.now();
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
            children: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
                .map((d) => Expanded(
                      child: Center(
                        child: Text(
                          d,
                          style: GoogleFonts.jetBrainsMono(
                            fontSize: 10,
                            fontWeight: FontWeight.w600,
                            color: AppColors.textTertiary,
                            letterSpacing: 0.6,
                          ),
                        ),
                      ),
                    ))
                .toList(),
          ),
          const SizedBox(height: 6),
          ...List.generate(days.length ~/ 7, (row) {
            return Row(
              children: List.generate(7, (col) {
                final day = days[row * 7 + col];
                return Expanded(
                  child: AspectRatio(
                    aspectRatio: 1.05,
                    child: day == null
                        ? const SizedBox.shrink()
                        : _DayCell(
                            day: day,
                            isSelected: day.year == selected.year &&
                                day.month == selected.month &&
                                day.day == selected.day,
                            isToday: day.year == today.year &&
                                day.month == today.month &&
                                day.day == today.day,
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
  const _DayCell({
    required this.day,
    required this.isSelected,
    required this.isToday,
    required this.onTap,
  });
  final DateTime day;
  final bool isSelected;
  final bool isToday;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.all(3),
        color: isSelected ? AppColors.accent : Colors.transparent,
        child: Stack(
          alignment: Alignment.center,
          children: [
            Text(
              '${day.day}',
              style: GoogleFonts.inter(
                fontSize: 13,
                fontWeight:
                    isSelected ? FontWeight.w700 : FontWeight.w500,
                color: isSelected
                    ? AppColors.background
                    : AppColors.textPrimary,
              ),
            ),
            if (isToday && !isSelected)
              Positioned(
                bottom: 4,
                child: Container(
                  width: 4,
                  height: 4,
                  decoration: const BoxDecoration(
                    color: AppColors.accent,
                    shape: BoxShape.circle,
                  ),
                ),
              ),
          ],
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
    final matching = events
        .where((e) =>
            e.startAt.year == day.year &&
            e.startAt.month == day.month &&
            e.startAt.day == day.day)
        .toList();

    final dayLabel = '${_monthName(day.month).substring(0, 3).toUpperCase()} ${day.day}';

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
      children: [
        Text(
          'SCHEDULE — $dayLabel',
          style: AppTextStyles.sectionLabel,
        ),
        const SizedBox(height: 12),
        if (matching.isEmpty)
          Text(
            'No events on $dayLabel',
            style: AppTextStyles.bodySmall,
          ),
        for (final event in matching) ...[
          _EventRow(event: event),
          const SizedBox(height: 16),
        ],
      ],
    );
  }
}

class _EventRow extends StatelessWidget {
  const _EventRow({required this.event});
  final CalendarEvent event;

  @override
  Widget build(BuildContext context) {
    return Row(
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
                style: AppTextStyles.monoSmall.copyWith(fontSize: 12),
              ),
              if (event.attendees.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 2),
                  child: Text(
                    event.attendees.take(3).join(', ') +
                        (event.attendees.length > 3
                            ? ' +${event.attendees.length - 3}'
                            : ''),
                    style: AppTextStyles.monoSmall.copyWith(fontSize: 12),
                  ),
                ),
            ],
          ),
        ),
      ],
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
