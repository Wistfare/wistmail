import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../../../core/theme/app_colors.dart';
import '../../domain/calendar_event.dart';
import '../providers/calendar_providers.dart';

/// MobileV3 Calendar — pen node `yPRau`.
///
/// Sections:
///   - cHdr: padding [8,16,12,16]. Left col gap 2 (eyebrow 10/700/1.5 secondary,
///     "This Week" 28/700 primary). Right actions gap 10 — new (38×38 accent
///     cornerRadius 19 plus icon 20 black) + view (38×38 surface cornerRadius
///     19 layout-grid 18 primary).
///   - daysRow: padding [0,16,16,16], gap 6, space_between.
///     Each day fill_container, cornerRadius 12, padding [10,0], gap 4, layout
///     vertical. Inactive: wm-surface fill, letters 10/600 secondary, date
///     16/700 primary. Active: wm-accent fill, letters and date black.
///   - schSect: padding [0,16], gap 14. sectTop space_between:
///     "WEEKDAY · N EVENTS" 10/700 secondary letterSpacing 1.5, "N FREE
///     HOURS" 10/700 accent letterSpacing 1.5.
///     Events: each row gap 12 horizontal, 50px time col + fill_container
///     card. Time col gap 2 vertical: time 13/700, duration 10/normal
///     secondary (or "NOW" 10/700 accent for active). Cards cornerRadius 14,
///     padding 14, left-stripe 3px per color.
class CalendarScreenV3 extends ConsumerStatefulWidget {
  const CalendarScreenV3({super.key});

  @override
  ConsumerState<CalendarScreenV3> createState() => _CalendarScreenV3State();
}

class _CalendarScreenV3State extends ConsumerState<CalendarScreenV3> {
  late DateTime _selected;
  late DateTime _weekStart;

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _selected = DateTime(now.year, now.month, now.day);
    _weekStart = _selected.subtract(Duration(days: _selected.weekday - 1));
  }

  @override
  Widget build(BuildContext context) {
    final events = ref.watch(upcomingEventsProvider);

    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _Header(
              monthLabel: _monthLabel(_weekStart),
              onNew: () => context.push('/calendar/new'),
            ),
            _DayStrip(
              weekStart: _weekStart,
              selected: _selected,
              onSelect: (d) => setState(() => _selected = d),
            ),
            Expanded(
              child: events.when(
                data: (all) {
                  final day = _eventsForDay(all, _selected);
                  return RefreshIndicator(
                    color: AppColors.accent,
                    backgroundColor: AppColors.surface,
                    onRefresh: () async {
                      ref.invalidate(upcomingEventsProvider);
                      await ref.read(upcomingEventsProvider.future);
                    },
                    child: ListView(
                      physics: const AlwaysScrollableScrollPhysics(),
                      padding: const EdgeInsets.fromLTRB(16, 0, 16, 20),
                      children: [
                        _SectionTop(
                          weekdayLabel: _weekdayLabel(_selected),
                          eventCount: day.length,
                          freeHours: _freeHoursFor(day),
                        ),
                        const SizedBox(height: 14),
                        if (day.isEmpty) const _EmptyDay(),
                        for (int i = 0; i < day.length; i++) ...[
                          _EventRow(event: day[i], now: DateTime.now()),
                          if (i < day.length - 1)
                            const SizedBox(height: 14),
                        ],
                      ],
                    ),
                  );
                },
                loading: () => const Center(
                  child: CircularProgressIndicator(
                      color: AppColors.accent, strokeWidth: 2),
                ),
                error: (_, __) => const _ErrorDay(),
              ),
            ),
          ],
        ),
      ),
    );
  }

  List<CalendarEvent> _eventsForDay(List<CalendarEvent> all, DateTime day) {
    final start = DateTime(day.year, day.month, day.day);
    final end = start.add(const Duration(days: 1));
    return all
        .where((e) => !e.startAt.isBefore(start) && e.startAt.isBefore(end))
        .toList()
      ..sort((a, b) => a.startAt.compareTo(b.startAt));
  }

  int _freeHoursFor(List<CalendarEvent> day) {
    const workMinutes = 9 * 60;
    final busy = day.fold<int>(
        0, (acc, e) => acc + e.endAt.difference(e.startAt).inMinutes);
    return ((workMinutes - busy) / 60).floor().clamp(0, 24);
  }

  static String _monthLabel(DateTime d) {
    const months = [
      'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
      'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER',
    ];
    return '${months[d.month - 1]} ${d.year}';
  }

  static String _weekdayLabel(DateTime d) {
    const days = [
      'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY',
      'FRIDAY', 'SATURDAY', 'SUNDAY',
    ];
    return days[d.weekday - 1];
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.monthLabel, required this.onNew});
  final String monthLabel;
  final VoidCallback onNew;
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  monthLabel,
                  style: GoogleFonts.jetBrainsMono(
                    color: AppColors.textSecondary,
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 1.5,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  'This Week',
                  style: GoogleFonts.jetBrainsMono(
                    color: AppColors.textPrimary,
                    fontSize: 28,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ),
          _HeaderButton(
            icon: LucideIcons.plus,
            iconSize: 20,
            filled: true,
            onTap: onNew,
          ),
          const SizedBox(width: 10),
          _HeaderButton(
            icon: LucideIcons.layoutGrid,
            iconSize: 18,
            filled: false,
            onTap: () {},
          ),
        ],
      ),
    );
  }
}

class _HeaderButton extends StatelessWidget {
  const _HeaderButton({
    required this.icon,
    required this.iconSize,
    required this.filled,
    required this.onTap,
  });
  final IconData icon;
  final double iconSize;
  final bool filled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    // Design: 38×38 cornerRadius 19.
    return InkWell(
      onTap: onTap,
      customBorder: const CircleBorder(),
      child: Container(
        width: 38,
        height: 38,
        decoration: BoxDecoration(
          color: filled ? AppColors.accent : AppColors.surface,
          shape: BoxShape.circle,
        ),
        alignment: Alignment.center,
        child: Icon(
          icon,
          size: iconSize,
          color: filled ? AppColors.background : AppColors.textPrimary,
        ),
      ),
    );
  }
}

class _DayStrip extends StatelessWidget {
  const _DayStrip({
    required this.weekStart,
    required this.selected,
    required this.onSelect,
  });
  final DateTime weekStart;
  final DateTime selected;
  final ValueChanged<DateTime> onSelect;

  @override
  Widget build(BuildContext context) {
    const labels = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
      child: Row(
        children: [
          for (int i = 0; i < 7; i++) ...[
            Expanded(
              child: _DayCell(
                label: labels[i],
                date: weekStart.add(Duration(days: i)),
                selected: _isSameDay(weekStart.add(Duration(days: i)), selected),
                onTap: () {
                  final d = weekStart.add(Duration(days: i));
                  onSelect(DateTime(d.year, d.month, d.day));
                },
              ),
            ),
            if (i < 6) const SizedBox(width: 6),
          ],
        ],
      ),
    );
  }

  static bool _isSameDay(DateTime a, DateTime b) =>
      a.year == b.year && a.month == b.month && a.day == b.day;
}

class _DayCell extends StatelessWidget {
  const _DayCell({
    required this.label,
    required this.date,
    required this.selected,
    required this.onTap,
  });
  final String label;
  final DateTime date;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    // Design: cornerRadius 12, padding [10,0], fill wm-surface / wm-accent.
    final labelColor = selected ? AppColors.background : AppColors.textSecondary;
    final dateColor = selected ? AppColors.background : AppColors.textPrimary;
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 10),
        decoration: BoxDecoration(
          color: selected ? AppColors.accent : AppColors.surface,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            Text(
              label,
              style: GoogleFonts.jetBrainsMono(
                color: labelColor,
                fontSize: 10,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              '${date.day}',
              style: GoogleFonts.jetBrainsMono(
                color: dateColor,
                fontSize: 16,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SectionTop extends StatelessWidget {
  const _SectionTop({
    required this.weekdayLabel,
    required this.eventCount,
    required this.freeHours,
  });
  final String weekdayLabel;
  final int eventCount;
  final int freeHours;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: Text(
            '$weekdayLabel · $eventCount ${eventCount == 1 ? 'EVENT' : 'EVENTS'}',
            style: GoogleFonts.jetBrainsMono(
              color: AppColors.textSecondary,
              fontSize: 10,
              fontWeight: FontWeight.w700,
              letterSpacing: 1.5,
            ),
          ),
        ),
        Text(
          '$freeHours ${freeHours == 1 ? 'FREE HOUR' : 'FREE HOURS'}',
          style: GoogleFonts.jetBrainsMono(
            color: AppColors.accent,
            fontSize: 10,
            fontWeight: FontWeight.w700,
            letterSpacing: 1.5,
          ),
        ),
      ],
    );
  }
}

class _EventRow extends StatelessWidget {
  const _EventRow({required this.event, required this.now});
  final CalendarEvent event;
  final DateTime now;

  @override
  Widget build(BuildContext context) {
    final active =
        now.isAfter(event.startAt.subtract(const Duration(minutes: 5))) &&
            now.isBefore(event.endAt);
    final duration = event.endAt.difference(event.startAt).inMinutes;

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 50,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                _fmtTime(event.startAt),
                style: GoogleFonts.jetBrainsMono(
                  color: AppColors.textPrimary,
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 2),
              active
                  ? Text(
                      'NOW',
                      style: GoogleFonts.jetBrainsMono(
                        color: AppColors.accent,
                        fontSize: 10,
                        fontWeight: FontWeight.w700,
                      ),
                    )
                  : Text(
                      _durationLabel(duration),
                      style: GoogleFonts.jetBrainsMono(
                        color: AppColors.textSecondary,
                        fontSize: 10,
                      ),
                    ),
            ],
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: active
              ? _ActiveEventCard(event: event)
              : _StandardEventCard(event: event, now: now),
        ),
      ],
    );
  }

  static String _durationLabel(int mins) {
    if (mins < 60) return '${mins}m';
    final hours = mins ~/ 60;
    final rem = mins % 60;
    if (rem == 0) return '${hours}h';
    return '${hours}h ${rem}m';
  }

  static String _fmtTime(DateTime dt) {
    final h = dt.hour.toString().padLeft(2, '0');
    final m = dt.minute.toString().padLeft(2, '0');
    return '$h:$m';
  }
}

class _ActiveEventCard extends StatelessWidget {
  const _ActiveEventCard({required this.event});
  final CalendarEvent event;
  @override
  Widget build(BuildContext context) {
    // Design ev2: fill wm-accent-dim, left stripe wm-accent 3px,
    // cornerRadius 14, padding 14, gap 10.
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.accentDim,
        borderRadius: BorderRadius.circular(14),
        border: const Border(
          left: BorderSide(color: AppColors.accent, width: 3),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      event.title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: GoogleFonts.jetBrainsMono(
                        color: AppColors.textPrimary,
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      '${_fmtTime(event.startAt)} - ${_fmtTime(event.endAt)}'
                      '${event.attendees.isNotEmpty ? ' · ${event.attendees.length} attendees' : ''}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: GoogleFonts.jetBrainsMono(
                        color: AppColors.textSecondary,
                        fontSize: 11,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              if (event.meetingLink != null) _MeetBadge(),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(child: _JoinNowButton(onTap: () => context.push('/meet'))),
              const SizedBox(width: 8),
              _ChatButton(),
            ],
          ),
        ],
      ),
    );
  }

  static String _fmtTime(DateTime dt) {
    final h = dt.hour.toString().padLeft(2, '0');
    final m = dt.minute.toString().padLeft(2, '0');
    return '$h:$m';
  }
}

class _MeetBadge extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    // Design: cornerRadius 10, padding [4,8], fill accent, gap 4.
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: AppColors.accent,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(LucideIcons.video, size: 12, color: AppColors.background),
          const SizedBox(width: 4),
          Text(
            'MEET',
            style: GoogleFonts.jetBrainsMono(
              color: AppColors.background,
              fontSize: 9,
              fontWeight: FontWeight.w700,
              letterSpacing: 1,
            ),
          ),
        ],
      ),
    );
  }
}

class _JoinNowButton extends StatelessWidget {
  const _JoinNowButton({required this.onTap});
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    // Design: height 40, cornerRadius 20, fill accent, padding [0,12],
    // gap 6, icon 14 + text 12/700 letterSpacing 1 black.
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(20),
      child: Container(
        height: 40,
        padding: const EdgeInsets.symmetric(horizontal: 12),
        decoration: BoxDecoration(
          color: AppColors.accent,
          borderRadius: BorderRadius.circular(20),
        ),
        alignment: Alignment.center,
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(LucideIcons.video, size: 14, color: AppColors.background),
            const SizedBox(width: 6),
            Text(
              'JOIN NOW',
              style: GoogleFonts.jetBrainsMono(
                color: AppColors.background,
                fontSize: 12,
                fontWeight: FontWeight.w700,
                letterSpacing: 1,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ChatButton extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    // Design: 40×40 cornerRadius 20 surface fill, icon message-square 16 primary.
    return Container(
      width: 40,
      height: 40,
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(20),
      ),
      alignment: Alignment.center,
      child: const Icon(LucideIcons.messageSquare,
          size: 16, color: AppColors.textPrimary),
    );
  }
}

class _StandardEventCard extends StatelessWidget {
  const _StandardEventCard({required this.event, required this.now});
  final CalendarEvent event;
  final DateTime now;
  @override
  Widget build(BuildContext context) {
    // Design ev1/ev3/ev4: fill wm-surface, cornerRadius 14, padding 14, gap 8.
    // Stripe color: wm-info for standard meetings, wm-warning for lunch
    // (we pick warning if no meeting link & has location), #6D4AD4 for tentative.
    final tentative = (event.hasWaitingRoom);
    final stripeColor = tentative
        ? const Color(0xFF6D4AD4)
        : (event.location != null && event.meetingLink == null)
            ? const Color(0xFFF59E0B)
            : const Color(0xFF3B82F6);
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border(
          left: BorderSide(color: stripeColor, width: 3),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Expanded(
                child: Text(
                  event.title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: GoogleFonts.jetBrainsMono(
                    color: AppColors.textPrimary,
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              if (tentative) ...[
                const SizedBox(width: 8),
                const _TentativeTag(),
              ],
            ],
          ),
          const SizedBox(height: 8),
          _MetaRow(event: event),
        ],
      ),
    );
  }
}

class _MetaRow extends StatelessWidget {
  const _MetaRow({required this.event});
  final CalendarEvent event;
  @override
  Widget build(BuildContext context) {
    final children = <Widget>[];

    if (event.attendees.isNotEmpty) {
      children.add(const Icon(LucideIcons.users,
          size: 12, color: AppColors.textSecondary));
      children.add(const SizedBox(width: 4));
      children.add(Text(
        '${event.attendees.length} people',
        style: GoogleFonts.jetBrainsMono(
          color: AppColors.textSecondary,
          fontSize: 11,
        ),
      ));
    }

    if (event.location != null && event.location!.isNotEmpty) {
      if (children.isNotEmpty) {
        children.add(const SizedBox(width: 8));
        children.add(Text(
          '·',
          style: GoogleFonts.jetBrainsMono(
            color: AppColors.textSecondary,
            fontSize: 11,
          ),
        ));
        children.add(const SizedBox(width: 8));
      }
      children.add(const Icon(LucideIcons.mapPin,
          size: 12, color: AppColors.textSecondary));
      children.add(const SizedBox(width: 4));
      children.add(Flexible(
        child: Text(
          event.location!,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: GoogleFonts.jetBrainsMono(
            color: AppColors.textSecondary,
            fontSize: 11,
          ),
        ),
      ));
    }

    if (children.isEmpty) return const SizedBox.shrink();
    return Row(children: children);
  }
}

class _TentativeTag extends StatelessWidget {
  const _TentativeTag();
  @override
  Widget build(BuildContext context) {
    // Design XXIKB: cornerRadius 4, padding [2,6], fill #6D4AD433, text
    // #B89AFF 8/700 letterSpacing 1.
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: const Color(0xFF6D4AD4).withValues(alpha: 0.2),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        'TENTATIVE',
        style: GoogleFonts.jetBrainsMono(
          color: const Color(0xFFB89AFF),
          fontSize: 8,
          fontWeight: FontWeight.w700,
          letterSpacing: 1,
        ),
      ),
    );
  }
}

class _EmptyDay extends StatelessWidget {
  const _EmptyDay();
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 80),
      child: Column(
        children: [
          const Icon(LucideIcons.calendarCheck,
              color: AppColors.textTertiary, size: 48),
          const SizedBox(height: 12),
          Text(
            'Nothing scheduled',
            style: GoogleFonts.jetBrainsMono(
              color: AppColors.textPrimary,
              fontSize: 14,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

class _ErrorDay extends StatelessWidget {
  const _ErrorDay();
  @override
  Widget build(BuildContext context) {
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      children: const [
        SizedBox(height: 80),
        Icon(LucideIcons.cloudOff,
            color: AppColors.textTertiary, size: 48),
      ],
    );
  }
}
