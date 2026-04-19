import 'package:flutter/material.dart';
import '../theme/app_colors.dart';
import '../theme/app_text_styles.dart';

/// Small mono tag pill — sharp corners, tinted bg with matching text color.
/// Used in email rows ("Priority", "Work", "Digest"), project status, etc.
class WmTag extends StatelessWidget {
  const WmTag({
    super.key,
    required this.label,
    required this.color,
    this.outlined = false,
  });

  final String label;
  final Color color;
  final bool outlined;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
      decoration: BoxDecoration(
        color: outlined ? Colors.transparent : color.withValues(alpha: 0.18),
        border: outlined ? Border.all(color: color, width: 1) : null,
      ),
      child: Text(
        label,
        style: AppTextStyles.tag.copyWith(color: color),
      ),
    );
  }
}

/// Solid lime tag (e.g. "Active" project status).
class WmAccentTag extends StatelessWidget {
  const WmAccentTag({super.key, required this.label});
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      color: AppColors.accent,
      child: Text(
        label,
        style: AppTextStyles.tag.copyWith(color: AppColors.background),
      ),
    );
  }
}
