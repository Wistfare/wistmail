import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../../../core/theme/app_colors.dart';
import '../../domain/today_summary.dart';

/// AI-picked priority row — surfaces the items the morning briefing
/// referred to (e.g. "the Investor reminder email") as tappable cards.
/// The hydration is server-side: API joins each priority's id back to
/// the underlying email/event/task and ships display metadata.
///
/// Three layouts share one widget so the Today screen can iterate one
/// list without branching at the call site:
///
///   - email: subject + sender + reason → routes to the email detail.
///   - event: title + time + reason → routes to the calendar event.
///   - task : title + project status + reason → routes to the task.
class TodayPriorityRow extends StatelessWidget {
  const TodayPriorityRow({super.key, required this.priority});

  final TodayPriority priority;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: () => _open(context),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.border),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _PriorityGlyph(kind: priority.kind),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    _primaryLine(),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: GoogleFonts.jetBrainsMono(
                      color: AppColors.textPrimary,
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    _secondaryLine(),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: GoogleFonts.jetBrainsMono(
                      color: AppColors.textSecondary,
                      fontSize: 11,
                      height: 1.45,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            const Icon(LucideIcons.chevronRight,
                size: 14, color: AppColors.textTertiary),
          ],
        ),
      ),
    );
  }

  String _primaryLine() {
    switch (priority.kind) {
      case 'email':
        return priority.subject ?? '(no subject)';
      case 'event':
        return priority.title ?? '(untitled event)';
      case 'task':
        return priority.title ?? '(untitled task)';
      default:
        return priority.id;
    }
  }

  String _secondaryLine() {
    final reason = priority.reason.trim();
    final sub = switch (priority.kind) {
      'email' => priority.fromName ?? priority.fromAddress,
      'event' => _formatTimeRange(priority.startAt, priority.endAt) ??
          priority.location,
      'task' => priority.status,
      _ => null,
    };
    if (reason.isEmpty && sub == null) return '';
    if (reason.isEmpty) return sub!;
    if (sub == null) return reason;
    return '$sub · $reason';
  }

  String? _formatTimeRange(DateTime? start, DateTime? end) {
    if (start == null) return null;
    final s = _formatHm(start.toLocal());
    if (end == null) return s;
    final e = _formatHm(end.toLocal());
    return '$s – $e';
  }

  String _formatHm(DateTime dt) {
    final h = dt.hour.toString().padLeft(2, '0');
    final m = dt.minute.toString().padLeft(2, '0');
    return '$h:$m';
  }

  void _open(BuildContext context) {
    switch (priority.kind) {
      case 'email':
        context.push('/email/${priority.id}');
        break;
      case 'event':
        context.push('/calendar/event/${priority.id}');
        break;
      case 'task':
        if (priority.projectId != null) {
          context.push('/projects/${priority.projectId}/tasks/${priority.id}');
        }
        break;
    }
  }
}

class _PriorityGlyph extends StatelessWidget {
  const _PriorityGlyph({required this.kind});
  final String kind;

  @override
  Widget build(BuildContext context) {
    final IconData icon;
    switch (kind) {
      case 'event':
        icon = LucideIcons.calendar;
        break;
      case 'task':
        icon = LucideIcons.squareCheckBig;
        break;
      default:
        icon = LucideIcons.mail;
    }
    return Container(
      width: 36,
      height: 36,
      decoration: BoxDecoration(
        color: AppColors.accentDim,
        borderRadius: BorderRadius.circular(10),
      ),
      alignment: Alignment.center,
      child: Icon(icon, size: 16, color: AppColors.accent),
    );
  }
}

