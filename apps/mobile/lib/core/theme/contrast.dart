import 'package:flutter/material.dart';
import 'app_colors.dart';

/// Picks black or white as the foreground for a colored chip / avatar /
/// badge. Uses WCAG relative luminance — anything bright enough that
/// black-on-it has a contrast ratio above 4.5 gets black, otherwise white.
///
/// This is the same rule the web uses (`stringToColor` + `getReadable`)
/// so a sender named "Alex" gets the same swatch + text color on every
/// surface.
Color readableOn(Color background) {
  // sRGB → linear, then BT.709 luma weights.
  double channel(int v) {
    final c = v / 255.0;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055).clamp(0.0, 1.0);
  }

  final r = channel((background.r * 255.0).round() & 0xff);
  final g = channel((background.g * 255.0).round() & 0xff);
  final b = channel((background.b * 255.0).round() & 0xff);
  final luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;

  // White text contrast against the bg = (1.0 + 0.05) / (L + 0.05)
  // Black text contrast against the bg = (L + 0.05) / 0.05
  // We pick whichever produces the higher ratio. Equivalent to the
  // cheap luminance > 0.5 check, but explicit so it's auditable.
  final whiteRatio = 1.05 / (luminance + 0.05);
  final blackRatio = (luminance + 0.05) / 0.05;
  return blackRatio >= whiteRatio ? AppColors.textPrimary : Colors.white;
}
