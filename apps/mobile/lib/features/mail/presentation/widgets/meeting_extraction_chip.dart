import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../../../core/theme/app_colors.dart';
import '../providers/mail_providers.dart';

/// Surfaces the AI's meeting extraction for the open email. Three
/// rendered states, all keyed off the server's `outcome` value:
///
///   outcome=2  → an event was auto-created. Chip says
///                "ADDED TO CALENDAR — Investor sync, Tue 11:00"
///                with a chevron, tap routes to the event.
///   outcome=1  → a meeting was detected but confidence wasn't high
///                enough to auto-create. (Reserved — the "Add to
///                calendar?" interactive variant ships in a follow-up;
///                for now we render nothing so users aren't prompted
///                with low-quality detections.)
///   outcome=0 / no row → nothing to show.
///
/// Pulled from `/api/v1/inbox/emails/:id/meeting-extraction`. Empty
/// 404 → no row → renders nothing. The provider is autoDispose so
/// leaving the screen drops the cache.
class MeetingExtractionChip extends ConsumerWidget {
  const MeetingExtractionChip({super.key, required this.emailId});

  final String emailId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final asyncExtraction = ref.watch(meetingExtractionProvider(emailId));
    return asyncExtraction.when(
      loading: () => const SizedBox.shrink(),
      error: (_, __) => const SizedBox.shrink(),
      data: (data) {
        if (data == null) return const SizedBox.shrink();
        final extraction = (data['extraction'] as Map?)?.cast<String, dynamic>();
        final event = (data['event'] as Map?)?.cast<String, dynamic>();
        if (extraction == null) return const SizedBox.shrink();
        final outcome = (extraction['outcome'] as num?)?.toInt() ?? 0;
        if (outcome != 2 || event == null) return const SizedBox.shrink();

        final eventId = event['id'] as String?;
        final title = event['title'] as String? ?? 'Meeting';
        final startStr = event['startAt'] as String?;
        final start =
            startStr == null ? null : DateTime.tryParse(startStr)?.toLocal();
        final timeLabel = start == null ? '' : _formatStart(start);

        return Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
          child: InkWell(
            borderRadius: BorderRadius.circular(12),
            onTap: eventId == null
                ? null
                : () => context.push('/calendar/event/$eventId'),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              decoration: BoxDecoration(
                color: AppColors.accentDim,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: AppColors.accent, width: 1),
              ),
              child: Row(
                children: [
                  const Icon(LucideIcons.calendarPlus,
                      size: 14, color: AppColors.accent),
                  const SizedBox(width: 8),
                  Text(
                    'ADDED TO CALENDAR',
                    style: GoogleFonts.jetBrainsMono(
                      color: AppColors.accent,
                      fontSize: 9,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 1,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      timeLabel.isEmpty ? title : '$title · $timeLabel',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: GoogleFonts.jetBrainsMono(
                        color: AppColors.textPrimary,
                        fontSize: 12,
                      ),
                    ),
                  ),
                  const Icon(LucideIcons.chevronRight,
                      size: 14, color: AppColors.accent),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  String _formatStart(DateTime dt) {
    const weekdays = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
    final wk = weekdays[dt.weekday - 1];
    final h = dt.hour.toString().padLeft(2, '0');
    final m = dt.minute.toString().padLeft(2, '0');
    return '$wk $h:$m';
  }
}
