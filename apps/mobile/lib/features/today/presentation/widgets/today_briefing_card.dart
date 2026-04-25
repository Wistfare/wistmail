import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../../../core/theme/app_colors.dart';
import '../../domain/today_summary.dart';

/// AI briefing card shown at the top of the Today screen when the
/// worker has produced a digest. Surfaces the model's 1–2 sentence
/// "good morning" overview plus up to two suggested focus blocks.
///
/// Design: same surface treatment as the next-up card (rounded 18,
/// surface fill) but in a quieter accent color so it doesn't compete
/// with a live meeting. Sparkle icon = AI affordance, used elsewhere
/// to mark AI-derived UI.
class TodayBriefingCard extends StatelessWidget {
  const TodayBriefingCard({super.key, required this.digest});

  final TodayDigest digest;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(18, 16, 18, 18),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(18),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(LucideIcons.sparkles, size: 14, color: AppColors.accent),
              const SizedBox(width: 8),
              Text(
                'BRIEFING',
                style: GoogleFonts.jetBrainsMono(
                  color: AppColors.textTertiary,
                  fontSize: 10,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 1,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            digest.briefing,
            style: GoogleFonts.jetBrainsMono(
              color: AppColors.textPrimary,
              fontSize: 13,
              fontWeight: FontWeight.w500,
              height: 1.5,
            ),
          ),
          if (digest.focusBlocks.isNotEmpty) ...[
            const SizedBox(height: 14),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final f in digest.focusBlocks) _FocusChip(block: f),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _FocusChip extends StatelessWidget {
  const _FocusChip({required this.block});
  final TodayFocusBlock block;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: AppColors.background,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(LucideIcons.brain, size: 12, color: AppColors.accent),
          const SizedBox(width: 6),
          Text(
            block.label,
            style: GoogleFonts.jetBrainsMono(
              color: AppColors.textPrimary,
              fontSize: 11,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}
