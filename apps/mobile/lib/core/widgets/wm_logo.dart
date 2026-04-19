import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../theme/app_colors.dart';

/// Sharp lime square with a black "W". The whole brand mark.
/// Sizes commonly seen: 28 (header), 56 (drawer), 80 (sign-in).
class WmLogo extends StatelessWidget {
  const WmLogo({super.key, this.size = 56});

  final double size;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      color: AppColors.accent,
      alignment: Alignment.center,
      child: Text(
        'W',
        style: GoogleFonts.jetBrainsMono(
          fontSize: size * 0.5,
          fontWeight: FontWeight.w700,
          color: AppColors.background,
          height: 1,
        ),
      ),
    );
  }
}
