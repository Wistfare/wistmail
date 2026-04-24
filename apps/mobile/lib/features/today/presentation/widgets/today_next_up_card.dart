import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../../../core/theme/app_colors.dart';
import '../../domain/today_summary.dart';

/// NEXT UP card — pen node `cXYBe` in MobileV3/Today.
///
/// Exact values:
///   fill wm-accent-dim, stroke wm-accent 1px, cornerRadius 16, padding 16.
///   layout vertical, gap 12.
/// Children (top-down):
///   1. nHead: space_between row — "NEXT UP · IN N MIN" (accent, 10/700
///      letterSpacing 1) / video icon 12 + "VIDEO" 9/700 accent ls 0.5.
///   2. Title: 18/700 mono, lineHeight 1.3, fill_container.
///   3. Meta row: "HH:MM – HH:MM" 12/500 secondary · (tertiary) · "N
///      attendees" 12/500 secondary — gap 12.
///   4. Attendees stack: 28×28 circles, gap -8 (overlap), cornerRadius 14,
///      2px wm-bg stroke, initials 9/700.
///   5. Actions row: gap 8. JOIN MEETING (fill_container, 44h, cornerRadius
///      22, accent fill, icon video 16 + text "JOIN MEETING" 12/700 ls 0.5,
///      gap 8) + more button 44×44 circle (cornerRadius 22) surface fill
///      + 1px border.
class TodayNextUpCard extends StatelessWidget {
  const TodayNextUpCard({super.key, required this.nextUp});

  final TodayNextUp nextUp;

  @override
  Widget build(BuildContext context) {
    final minutes = nextUp.minutesUntilStart;
    final timeChip = _formatChip(minutes);
    final attendees = nextUp.attendees;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.accentDim,
        border: Border.all(color: AppColors.accent, width: 1),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // nHead — space_between
          Row(
            children: [
              Expanded(
                child: Text(
                  'NEXT UP · $timeChip',
                  style: GoogleFonts.jetBrainsMono(
                    color: AppColors.accent,
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 1,
                  ),
                ),
              ),
              if (nextUp.meetingLink != null) ...[
                const Icon(LucideIcons.video,
                    color: AppColors.accent, size: 12),
                const SizedBox(width: 6),
                Text(
                  'VIDEO',
                  style: GoogleFonts.jetBrainsMono(
                    color: AppColors.accent,
                    fontSize: 9,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.5,
                  ),
                ),
              ],
            ],
          ),
          const SizedBox(height: 12),
          // Title
          Text(
            nextUp.title,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: GoogleFonts.jetBrainsMono(
              color: AppColors.textPrimary,
              fontSize: 18,
              fontWeight: FontWeight.w700,
              height: 1.3,
            ),
          ),
          const SizedBox(height: 12),
          // Meta — gap 12 between items
          Row(
            children: [
              Text(
                '${_fmtTime(nextUp.startAt)} – ${_fmtTime(nextUp.endAt)}',
                style: GoogleFonts.jetBrainsMono(
                  color: AppColors.textSecondary,
                  fontSize: 12,
                  fontWeight: FontWeight.w500,
                ),
              ),
              const SizedBox(width: 12),
              Text(
                '·',
                style: GoogleFonts.jetBrainsMono(
                  color: AppColors.textTertiary,
                  fontSize: 12,
                ),
              ),
              const SizedBox(width: 12),
              Text(
                '${attendees.length} attendees',
                style: GoogleFonts.jetBrainsMono(
                  color: AppColors.textSecondary,
                  fontSize: 12,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          // Attendees stack — overlap via negative spacing.
          if (attendees.isNotEmpty)
            _AttendeeStack(attendees: attendees),
          const SizedBox(height: 12),
          // Actions — gap 8
          Row(
            children: [
              Expanded(
                child: _JoinButton(
                  onTap: () => GoRouter.of(context).push('/meet'),
                ),
              ),
              const SizedBox(width: 8),
              _MoreButton(),
            ],
          ),
        ],
      ),
    );
  }

  static String _formatChip(int minutes) {
    if (minutes <= 0) return 'NOW';
    if (minutes < 60) return 'IN $minutes MIN';
    final hours = (minutes / 60).floor();
    return 'IN ${hours}H';
  }

  static String _fmtTime(DateTime dt) {
    final h = dt.hour.toString().padLeft(2, '0');
    final m = dt.minute.toString().padLeft(2, '0');
    return '$h:$m';
  }
}

class _AttendeeStack extends StatelessWidget {
  const _AttendeeStack({required this.attendees});
  final List<String> attendees;
  @override
  Widget build(BuildContext context) {
    // Design caps the visible stack at 3 avatars + a "+N" chip.
    const maxVisible = 3;
    final visible = attendees.take(maxVisible).toList();
    final extra = attendees.length - visible.length;
    // Palette per index: accent, blue, amber (matches design).
    const palette = [
      AppColors.accent,
      Color(0xFF3B82F6),
      Color(0xFFF59E0B),
    ];

    Widget chip(int i, String seed, {bool isOverflow = false, int? extra}) {
      final isFirst = i == 0 && !isOverflow;
      return Transform.translate(
        offset: Offset(i == 0 ? 0 : -8.0 * i, 0),
        child: Container(
          width: 28,
          height: 28,
          decoration: BoxDecoration(
            color: isOverflow
                ? AppColors.surface
                : palette[i % palette.length],
            shape: BoxShape.circle,
            border: Border.all(color: AppColors.background, width: 2),
          ),
          alignment: Alignment.center,
          child: Text(
            isOverflow ? '+$extra' : _initialsFor(seed),
            style: GoogleFonts.jetBrainsMono(
              color: isOverflow
                  ? AppColors.textSecondary
                  : isFirst
                      ? AppColors.background
                      : Colors.white,
              fontSize: 9,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
      );
    }

    final chips = <Widget>[];
    for (int i = 0; i < visible.length; i++) {
      chips.add(chip(i, visible[i]));
    }
    if (extra > 0) {
      chips.add(chip(visible.length, '', isOverflow: true, extra: extra));
    }

    // Row's natural width shrinks because of the negative translate — wrap
    // in a SizedBox so the following widgets can still measure.
    final totalWidth = 28 + ((visible.length + (extra > 0 ? 1 : 0)) - 1) * 20;
    return SizedBox(
      width: totalWidth.toDouble().clamp(28, double.infinity),
      height: 28,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          for (int i = 0; i < chips.length; i++)
            Positioned(
              left: i * 20.0,
              top: 0,
              child: chips[i] is Transform
                  ? (chips[i] as Transform).child!
                  : chips[i],
            ),
        ],
      ),
    );
  }

  static String _initialsFor(String v) {
    if (v.isEmpty) return '?';
    final m = RegExp(r'^\s*"?([^"<]+?)"?\s*<').firstMatch(v);
    final name = m?.group(1)?.trim() ?? v.split('@').first;
    final parts = name.split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
    if (parts.length >= 2) {
      return (parts.first[0] + parts.last[0]).toUpperCase();
    }
    return parts.first.length >= 2
        ? parts.first.substring(0, 2).toUpperCase()
        : parts.first[0].toUpperCase();
  }
}

class _JoinButton extends StatelessWidget {
  const _JoinButton({required this.onTap});
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(22),
      child: Container(
        height: 44,
        decoration: BoxDecoration(
          color: AppColors.accent,
          borderRadius: BorderRadius.circular(22),
        ),
        alignment: Alignment.center,
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(LucideIcons.video,
                color: AppColors.background, size: 16),
            const SizedBox(width: 8),
            Text(
              'JOIN MEETING',
              style: GoogleFonts.jetBrainsMono(
                color: AppColors.background,
                fontSize: 12,
                fontWeight: FontWeight.w700,
                letterSpacing: 0.5,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _MoreButton extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      width: 44,
      height: 44,
      decoration: BoxDecoration(
        color: AppColors.surface,
        shape: BoxShape.circle,
        border: Border.all(color: AppColors.border, width: 1),
      ),
      alignment: Alignment.center,
      child: const Icon(LucideIcons.ellipsis,
          color: AppColors.textPrimary, size: 18),
    );
  }
}
