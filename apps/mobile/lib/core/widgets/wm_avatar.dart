import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../theme/app_colors.dart';

/// Circular initial-letter avatar — chat list, sender row in EmailDetail,
/// drawer header.
class WmAvatar extends StatelessWidget {
  const WmAvatar({
    super.key,
    required this.name,
    this.size = 36,
    this.color,
  });

  final String name;
  final double size;
  final Color? color;

  static const _palette = [
    AppColors.avatarBlue,
    AppColors.avatarPurple,
    AppColors.avatarGreen,
    AppColors.avatarOrange,
    AppColors.avatarTeal,
  ];

  static Color colorFor(String seed) {
    if (seed.isEmpty) return _palette[0];
    final hash = seed.codeUnits.fold<int>(0, (a, b) => a + b);
    return _palette[hash % _palette.length];
  }

  String get _initials {
    final trimmed = name.trim();
    if (trimmed.isEmpty) return '?';
    final parts = trimmed.split(RegExp(r'\s+'));
    if (parts.length == 1) {
      final s = parts.first;
      return s.length >= 2 ? s.substring(0, 2).toUpperCase() : s[0].toUpperCase();
    }
    return (parts.first[0] + parts.last[0]).toUpperCase();
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: color ?? colorFor(name),
        shape: BoxShape.circle,
      ),
      alignment: Alignment.center,
      child: Text(
        _initials,
        style: GoogleFonts.inter(
          fontSize: size * 0.36,
          fontWeight: FontWeight.w600,
          color: Colors.white,
          height: 1,
        ),
      ),
    );
  }
}
