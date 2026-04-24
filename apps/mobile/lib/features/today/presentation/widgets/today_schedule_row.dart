import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../../../core/theme/app_colors.dart';
import '../../domain/today_summary.dart';

/// SCHEDULE · TODAY row — pen `ev1` / `ev2` in MobileV3/Today.
///
/// Exact values:
///   Row: horizontal gap 14; fixed 56px time column + fill_container card.
///   Time column: gap 2 vertical, time 13/700 (accent if active, primary
///   otherwise), duration 10/500 tertiary.
///   Card: fill wm-surface, cornerRadius 12, padding 12, layout vertical
///   gap 6, **border-left 3px** (accent for active, #3B82F6 for next).
///   Card title: 13/700 mono primary.
///   Meta row: icon 10 + text 11/500 tertiary, gap 10.
class TodayScheduleRow extends StatelessWidget {
  const TodayScheduleRow({super.key, required this.event});

  final TodayScheduleEvent event;

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final active =
        now.isAfter(event.startAt.subtract(const Duration(minutes: 10))) &&
            now.isBefore(event.endAt);
    final stripeColor =
        active ? AppColors.accent : const Color(0xFF3B82F6);
    final timeColor = active ? AppColors.accent : AppColors.textPrimary;
    final durationText = _durationLabel(event);

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 56,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                _fmtTime(event.startAt),
                style: GoogleFonts.jetBrainsMono(
                  color: timeColor,
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                durationText,
                style: GoogleFonts.jetBrainsMono(
                  color: AppColors.textTertiary,
                  fontSize: 10,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(width: 14),
        Expanded(
          child: Container(
            padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
            decoration: BoxDecoration(
              color: AppColors.surface,
              borderRadius: BorderRadius.circular(12),
              border: Border(
                left: BorderSide(color: stripeColor, width: 3),
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  event.title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: GoogleFonts.jetBrainsMono(
                    color: AppColors.textPrimary,
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 6),
                _MetaRow(event: event),
              ],
            ),
          ),
        ),
      ],
    );
  }

  static String _durationLabel(TodayScheduleEvent e) {
    final mins = e.endAt.difference(e.startAt).inMinutes;
    if (mins < 60) return '$mins min';
    final hours = mins / 60;
    if (hours == hours.floor()) return '${hours.floor()} h';
    return '${hours.toStringAsFixed(1)} h';
  }

  static String _fmtTime(DateTime dt) {
    final h = dt.hour.toString().padLeft(2, '0');
    final m = dt.minute.toString().padLeft(2, '0');
    return '$h:$m';
  }
}

class _MetaRow extends StatelessWidget {
  const _MetaRow({required this.event});
  final TodayScheduleEvent event;
  @override
  Widget build(BuildContext context) {
    // Prefer video indicator when there's a meeting link; otherwise
    // location + people count.
    final IconData icon =
        event.meetingLink != null ? LucideIcons.video : LucideIcons.mapPin;
    final label = event.meetingLink != null
        ? 'Google Meet${event.attendees.isNotEmpty ? ' · ${event.attendees.length} people' : ''}'
        : (event.location ?? '${event.attendees.length} people');
    return Row(
      children: [
        Icon(icon, size: 10, color: AppColors.textTertiary),
        const SizedBox(width: 10),
        Flexible(
          child: Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: GoogleFonts.jetBrainsMono(
              color: AppColors.textTertiary,
              fontSize: 11,
              fontWeight: FontWeight.w500,
            ),
          ),
        ),
      ],
    );
  }
}
