import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../theme/app_colors.dart';

/// MobileV3 section header — monospace, uppercase, muted, with an optional
/// right-aligned trailing widget (e.g. "SEE ALL" link, event count, date).
///
/// Used across Today / Work / Me to label sections like "NEEDS REPLY • 3".
class WmSectionHeader extends StatelessWidget {
  const WmSectionHeader({
    super.key,
    required this.label,
    this.trailing,
    this.padding = const EdgeInsets.fromLTRB(4, 16, 4, 8),
  });

  final String label;
  final Widget? trailing;
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: padding,
      child: Row(
        children: [
          Expanded(
            child: Text(
              label.toUpperCase(),
              style: GoogleFonts.jetBrainsMono(
                color: AppColors.textTertiary,
                fontSize: 11,
                fontWeight: FontWeight.w500,
                letterSpacing: 1.2,
              ),
            ),
          ),
          if (trailing != null) trailing!,
        ],
      ),
    );
  }
}
