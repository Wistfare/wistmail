import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../../../core/fcm/push_client.dart';
import '../../../../core/theme/app_colors.dart';
import '../providers/mail_providers.dart';

/// Surfaces the AI's meeting extraction for the open email. Three
/// rendered states, all keyed off the server's `outcome` value:
///
///   outcome=2  → an event was auto-created OR the user accepted a
///                mid-confidence suggestion. Green chip linking to the
///                event.
///   outcome=1  → mid-confidence detection — interactive amber chip
///                with Add / Dismiss buttons. Accept fires
///                `POST /accept` and the chip flips to the green
///                state without a refetch. Dismiss fires
///                `POST /dismiss` and the chip is hidden for good.
///   outcome=0 / -1 / no row → nothing to show.
///
/// Pulled from `/api/v1/inbox/emails/:id/meeting-extraction`. Empty
/// 404 → no row → renders nothing. The provider is autoDispose so
/// leaving the screen drops the cache.
class MeetingExtractionChip extends ConsumerStatefulWidget {
  const MeetingExtractionChip({super.key, required this.emailId});

  final String emailId;

  @override
  ConsumerState<MeetingExtractionChip> createState() =>
      _MeetingExtractionChipState();
}

class _MeetingExtractionChipState
    extends ConsumerState<MeetingExtractionChip> {
  bool _busy = false;

  @override
  Widget build(BuildContext context) {
    // Invalidate on FCM updates for this email — covers the case where
    // the worker finishes extract-meeting after the screen first
    // mounted. The `email.new.update` event fires once the per-email
    // AI fan-out completes, by which time extract-meeting has either
    // produced a row or decided not to.
    ref.listen<AsyncValue<Map<String, String>>>(
      fcmForegroundEventsProvider,
      (_, next) {
        next.whenData((data) {
          if (data['emailId'] != widget.emailId) return;
          final t = data['type'];
          if (t == 'email.new.update' ||
              t == 'email.meeting.created' ||
              t == 'email.suggestions.ready') {
            ref.invalidate(meetingExtractionProvider(widget.emailId));
          }
        });
      },
    );

    final asyncExtraction =
        ref.watch(meetingExtractionProvider(widget.emailId));
    return asyncExtraction.when(
      loading: () => const SizedBox.shrink(),
      error: (_, __) => const SizedBox.shrink(),
      data: (data) {
        if (data == null) return const SizedBox.shrink();
        final extraction =
            (data['extraction'] as Map?)?.cast<String, dynamic>();
        final event = (data['event'] as Map?)?.cast<String, dynamic>();
        if (extraction == null) return const SizedBox.shrink();
        final outcome = (extraction['outcome'] as num?)?.toInt() ?? 0;

        if (outcome == 2 && event != null) return _addedChip(event);
        if (outcome == 1) return _suggestionChip(extraction);
        return const SizedBox.shrink();
      },
    );
  }

  // ── outcome=2 ── auto-created or accepted ──────────────────────────
  Widget _addedChip(Map<String, dynamic> event) {
    final eventId = event['id'] as String?;
    final title = event['title'] as String? ?? 'Meeting';
    final start = _parseLocalDate(event['startAt'] as String?);
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
  }

  // ── outcome=1 ── interactive "Add to calendar?" ────────────────────
  Widget _suggestionChip(Map<String, dynamic> extraction) {
    final title = extraction['title'] as String? ?? 'Meeting';
    final start = _parseLocalDate(extraction['startAt'] as String?);
    final timeLabel = start == null ? '' : _formatStart(start);
    final headline = timeLabel.isEmpty ? title : '$title · $timeLabel';
    // Amber palette for "uncertain" — sits between the surface neutral
    // and the green accepted/auto-created state, signalling the user
    // should make a call.
    const amber = Color(0xFFF5B544);
    const amberBg = Color(0xFF2A1F08);

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
      child: Container(
        padding: const EdgeInsets.fromLTRB(12, 10, 8, 8),
        decoration: BoxDecoration(
          color: amberBg,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: amber, width: 1),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(LucideIcons.calendarClock,
                    size: 14, color: amber),
                const SizedBox(width: 8),
                Text(
                  'MEETING DETECTED',
                  style: GoogleFonts.jetBrainsMono(
                    color: amber,
                    fontSize: 9,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 1,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 4),
            Padding(
              padding: const EdgeInsets.only(left: 22),
              child: Text(
                headline,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: GoogleFonts.jetBrainsMono(
                  color: AppColors.textPrimary,
                  fontSize: 12,
                ),
              ),
            ),
            const SizedBox(height: 10),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                _ChipButton(
                  label: 'DISMISS',
                  onTap: _busy ? null : _onDismiss,
                  filled: false,
                ),
                const SizedBox(width: 8),
                _ChipButton(
                  label: _busy ? 'ADDING…' : 'ADD TO CALENDAR',
                  onTap: _busy ? null : _onAccept,
                  filled: true,
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _onAccept() async {
    setState(() => _busy = true);
    final repo = await ref.read(mailRepositoryProvider.future);
    try {
      await repo.acceptMeetingExtraction(widget.emailId);
      ref.invalidate(meetingExtractionProvider(widget.emailId));
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("Couldn't add to calendar")),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _onDismiss() async {
    setState(() => _busy = true);
    final repo = await ref.read(mailRepositoryProvider.future);
    try {
      await repo.dismissMeetingExtraction(widget.emailId);
      ref.invalidate(meetingExtractionProvider(widget.emailId));
    } catch (_) {
      // Silent — dismiss is best-effort; the chip will just show
      // again on next open.
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  DateTime? _parseLocalDate(String? iso) {
    if (iso == null) return null;
    return DateTime.tryParse(iso)?.toLocal();
  }

  String _formatStart(DateTime dt) {
    const weekdays = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
    final wk = weekdays[dt.weekday - 1];
    final h = dt.hour.toString().padLeft(2, '0');
    final m = dt.minute.toString().padLeft(2, '0');
    return '$wk $h:$m';
  }
}

class _ChipButton extends StatelessWidget {
  const _ChipButton({
    required this.label,
    required this.onTap,
    required this.filled,
  });
  final String label;
  final VoidCallback? onTap;
  final bool filled;
  static const _amber = Color(0xFFF5B544);

  @override
  Widget build(BuildContext context) {
    return Material(
      color: filled ? _amber : Colors.transparent,
      borderRadius: BorderRadius.circular(8),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(8),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: _amber, width: 1),
          ),
          child: Text(
            label,
            style: GoogleFonts.jetBrainsMono(
              color: filled ? const Color(0xFF1A1108) : _amber,
              fontSize: 9,
              fontWeight: FontWeight.w700,
              letterSpacing: 1,
            ),
          ),
        ),
      ),
    );
  }
}
