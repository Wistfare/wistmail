import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../../../core/theme/app_colors.dart';
import '../../domain/today_summary.dart';

/// RECENT ACTIVITY row — pen `act1..act3` in MobileV3/Today.
///
/// Exact values:
///   row padding [10, 0], gap 12, alignItems center.
///   icon badge: 32×32, cornerRadius 8, fill wm-surface, icon 16,
///   color per-type (accent for project, #3B82F6 for chat, #F59E0B
///   for calendar invite).
///   text col: gap 2; title 11/700 primary mono; subtitle 11/500
///   secondary mono.
class TodayActivityRow extends StatelessWidget {
  const TodayActivityRow({super.key, required this.item});

  final TodayActivityItem item;

  @override
  Widget build(BuildContext context) {
    // The pen only defines project activity — we keep the project icon
    // as the single path until more activity kinds ship.
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          _IconBadge(
            icon: LucideIcons.folderKanban,
            color: AppColors.accent,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  item.projectName.isEmpty
                      ? 'Project update'
                      : 'Project: ${item.projectName}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: GoogleFonts.jetBrainsMono(
                    color: AppColors.textPrimary,
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  _describe(),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: GoogleFonts.jetBrainsMono(
                    color: AppColors.textSecondary,
                    fontSize: 11,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  String _describe() {
    switch (item.status) {
      case 'done':
        return 'Moved "${item.taskTitle}" to Done';
      case 'in_progress':
        return 'Moved "${item.taskTitle}" to In Progress';
      default:
        return 'Updated "${item.taskTitle}"';
    }
  }
}

class _IconBadge extends StatelessWidget {
  const _IconBadge({required this.icon, required this.color});
  final IconData icon;
  final Color color;
  @override
  Widget build(BuildContext context) {
    return Container(
      width: 32,
      height: 32,
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(8),
      ),
      alignment: Alignment.center,
      child: Icon(icon, color: color, size: 16),
    );
  }
}
