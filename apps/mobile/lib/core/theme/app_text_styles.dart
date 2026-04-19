import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'app_colors.dart';

/// Two families: Inter for UI/body, JetBrains Mono for tags / section
/// headers / email addresses / email body / metadata.
abstract final class AppTextStyles {
  // Display / titles (Inter)
  static TextStyle displayLarge = GoogleFonts.inter(
    fontSize: 28, fontWeight: FontWeight.bold,
    color: AppColors.textPrimary, height: 1.2,
  );
  static TextStyle headlineMedium = GoogleFonts.inter(
    fontSize: 22, fontWeight: FontWeight.w700,
    color: AppColors.textPrimary, height: 1.25,
  );
  static TextStyle titleLarge = GoogleFonts.inter(
    fontSize: 18, fontWeight: FontWeight.w600,
    color: AppColors.textPrimary,
  );
  static TextStyle titleMedium = GoogleFonts.inter(
    fontSize: 16, fontWeight: FontWeight.w600,
    color: AppColors.textPrimary,
  );

  // Body (Inter)
  static TextStyle bodyLarge = GoogleFonts.inter(
    fontSize: 15, fontWeight: FontWeight.normal,
    color: AppColors.textPrimary, height: 1.5,
  );
  static TextStyle bodyMedium = GoogleFonts.inter(
    fontSize: 14, fontWeight: FontWeight.normal,
    color: AppColors.textPrimary, height: 1.45,
  );
  static TextStyle bodySmall = GoogleFonts.inter(
    fontSize: 13, fontWeight: FontWeight.normal,
    color: AppColors.textSecondary, height: 1.45,
  );
  static TextStyle caption = GoogleFonts.inter(
    fontSize: 12, fontWeight: FontWeight.normal,
    color: AppColors.textSecondary,
  );
  static TextStyle accentBody = GoogleFonts.inter(
    fontSize: 14, fontWeight: FontWeight.w600,
    color: AppColors.accent,
  );

  // Mono (JetBrains Mono)
  /// Uppercase section label — "FOLDERS", "LABELS".
  static TextStyle sectionLabel = GoogleFonts.jetBrainsMono(
    fontSize: 11, fontWeight: FontWeight.w600,
    color: AppColors.textTertiary, letterSpacing: 1.2,
  );

  /// Form field label — "EMAIL", "PASSWORD".
  static TextStyle inputLabel = GoogleFonts.jetBrainsMono(
    fontSize: 11, fontWeight: FontWeight.w600,
    color: AppColors.textSecondary, letterSpacing: 0.8,
  );

  /// Email addresses + similar mono identifiers.
  static TextStyle monoSmall = GoogleFonts.jetBrainsMono(
    fontSize: 12, fontWeight: FontWeight.normal,
    color: AppColors.textSecondary,
  );
  static TextStyle monoMedium = GoogleFonts.jetBrainsMono(
    fontSize: 13, fontWeight: FontWeight.normal,
    color: AppColors.textPrimary, height: 1.7,
  );

  /// Small tag pill text.
  static TextStyle tag = GoogleFonts.jetBrainsMono(
    fontSize: 10, fontWeight: FontWeight.w600, letterSpacing: 0.2,
  );

  /// Row meta — "2m ago", "1h".
  static TextStyle meta = GoogleFonts.jetBrainsMono(
    fontSize: 11, fontWeight: FontWeight.normal,
    color: AppColors.textTertiary,
  );

  // Back-compat
  static TextStyle get labelSmall => inputLabel;
}
