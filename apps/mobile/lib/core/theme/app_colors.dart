import 'package:flutter/material.dart';

/// Color tokens extracted from design.lib.pen Mobile/* frames.
///
/// Sharp-cornered black-on-black with a single chartreuse accent. Don't
/// introduce new colors here without referencing a screen in the .pen file.
abstract final class AppColors {
  // Surfaces — exact values from design.lib.pen variables.
  // wm-bg / wm-surface / wm-surface-hover.
  static const Color background = Color(0xFF000000);
  static const Color surface = Color(0xFF111111);
  static const Color surfaceElevated = Color(0xFF1A1A1A); // wm-surface-hover

  // Borders / dividers — wm-border.
  static const Color border = Color(0xFF1A1A1A);
  static const Color borderStrong = Color(0xFF222222);

  // Accent — wm-accent / wm-accent-dim (pen-defined exactly).
  static const Color accent = Color(0xFF589B4C);
  static const Color accentSubtle = Color(0xFF1F3D1B);
  static const Color accentDim = Color(0xFF10220D);

  // Text — pen variables wm-text-*.
  static const Color textPrimary = Color(0xFFFFFFFF);
  static const Color textSecondary = Color(0xFF999999);
  static const Color textTertiary = Color(0xFF6E6E6E);
  static const Color textMuted = Color(0xFF404040);

  // Status / system — wm-error / wm-success / wm-warning.
  static const Color danger = Color(0xFFFF4444);
  static const Color dangerSubtle = Color(0xFF2A0E0E);
  static const Color success = Color(0xFF589B4C);

  // Drawer
  static const Color drawerBackground = Color(0xFF111111);
  static const Color drawerOverlay = Color(0x80000000);

  // Chat bubbles
  static const Color receivedBubble = Color(0xFF1A1A1A);
  static const Color sentBubble = Color(0xFF1F3D1B);

  // Aliases kept for backward compat with existing screens
  static const Color unreadDot = accent;
  static const Color badgeRed = danger;

  // Label dot palette (drawer + assign-label screen)
  static const Color labelRed = Color(0xFFEF4444);
  static const Color labelBlue = Color(0xFF3B82F6);
  static const Color labelOrange = Color(0xFFF59E0B);
  static const Color labelTeal = Color(0xFF14B8A6);
  static const Color labelPurple = Color(0xFF8B5CF6);
  static const Color labelPink = Color(0xFFEC4899);
  static const Color labelCyan = Color(0xFF06B6D4);
  static const Color labelYellow = Color(0xFFEAB308);

  // Tags shown on email rows
  static const Color tagPriority = accent;
  static const Color tagWork = Color(0xFF3B82F6);
  static const Color tagDigest = Color(0xFF8B5CF6);

  // Drawer label dots (back-compat names)
  static const Color labelDotPriority = labelYellow;
  static const Color labelDotWork = labelBlue;
  static const Color labelDotNewsletters = labelOrange;

  // Avatar circle backgrounds (chat list)
  static const Color avatarBlue = Color(0xFF3B5BA9);
  static const Color avatarPurple = Color(0xFF6B46C1);
  static const Color avatarGreen = Color(0xFF2F855A);
  static const Color avatarOrange = Color(0xFFC05621);
  static const Color avatarTeal = Color(0xFF0E7C7B);
}
