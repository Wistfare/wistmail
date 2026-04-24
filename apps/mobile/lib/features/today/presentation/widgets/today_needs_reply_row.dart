import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../../../core/theme/app_colors.dart';
import '../../domain/today_summary.dart';

/// NEEDS REPLY row — pen nodes `nr1` / `nr2` in MobileV3/Today.
///
/// Exact values:
///   container fill wm-surface, 1px wm-border, cornerRadius 12, padding 12.
///   horizontal layout, gap 12, alignItems center.
///   avatar 36×36 circle (cornerRadius 18), fill accent/blue, initials 12/700 mono.
///   column (gap 2): top row (name + time "2h" tertiary 10/normal,
///   space_between), subject 11/normal secondary lineHeight 1.4.
class TodayNeedsReplyRow extends StatelessWidget {
  const TodayNeedsReplyRow({super.key, required this.item});

  final TodayNeedsReplyItem item;

  @override
  Widget build(BuildContext context) {
    final senderName = _extractName(item.fromAddress);
    final initials = _initials(senderName);
    final age = _relativeAge(item.createdAt);
    // Deterministic color from sender so repeat senders get the same avatar.
    final color = _avatarColor(senderName);

    return InkWell(
      onTap: () => GoRouter.of(context).push('/email/${item.emailId}'),
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.border, width: 1),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            _Avatar(initials: initials, color: color),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Flexible(
                              child: Text(
                                senderName,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: GoogleFonts.jetBrainsMono(
                                  color: AppColors.textPrimary,
                                  fontSize: 13,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                      Text(
                        age,
                        style: GoogleFonts.jetBrainsMono(
                          color: AppColors.textTertiary,
                          fontSize: 10,
                          fontWeight: FontWeight.w400,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 2),
                  Text(
                    item.subject,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: GoogleFonts.jetBrainsMono(
                      color: AppColors.textSecondary,
                      fontSize: 11,
                      fontWeight: FontWeight.w400,
                      height: 1.4,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  static String _extractName(String from) {
    final m = RegExp(r'^\s*"?([^"<]+?)"?\s*<').firstMatch(from);
    if (m != null) return m.group(1)!.trim();
    return from.split('@').first;
  }

  static String _initials(String name) {
    final parts = name.split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
    if (parts.length >= 2) return (parts.first[0] + parts.last[0]).toUpperCase();
    return parts.first.length >= 2
        ? parts.first.substring(0, 2).toUpperCase()
        : parts.first[0].toUpperCase();
  }

  // Design uses accent and #3B82F6 as seen in the pen. We rotate through
  // a small palette keyed on the sender name for stability.
  static Color _avatarColor(String seed) {
    const palette = [
      AppColors.accent,
      Color(0xFF3B82F6),
      Color(0xFFF59E0B),
    ];
    if (seed.isEmpty) return palette[0];
    final hash = seed.codeUnits.fold<int>(0, (a, b) => a + b);
    return palette[hash % palette.length];
  }

  static String _relativeAge(DateTime t) {
    final delta = DateTime.now().difference(t);
    if (delta.inMinutes < 60) return '${delta.inMinutes}m';
    if (delta.inHours < 24) return '${delta.inHours}h';
    return '${delta.inDays}d';
  }
}

class _Avatar extends StatelessWidget {
  const _Avatar({required this.initials, required this.color});
  final String initials;
  final Color color;
  @override
  Widget build(BuildContext context) {
    // Design: 36×36, cornerRadius 18, 12/700 mono initials.
    final isAccent = color == AppColors.accent;
    return Container(
      width: 36,
      height: 36,
      decoration: BoxDecoration(
        color: color,
        shape: BoxShape.circle,
      ),
      alignment: Alignment.center,
      child: Text(
        initials,
        style: GoogleFonts.jetBrainsMono(
          color: isAccent ? AppColors.background : Colors.white,
          fontSize: 12,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}
