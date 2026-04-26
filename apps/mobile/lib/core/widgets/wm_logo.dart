import 'package:flutter/material.dart';

/// Brand mark — the round W glyph with the satellite chat / mail /
/// calendar / video chips. Renders the canonical PNG; theme-adaptive
/// by default:
///
///   - Light theme → `assets/wimail-logo.png` (green on transparent)
///   - Dark theme  → `assets/wimail-logo-white.png` (white on transparent)
///
/// Pass `colored: true` to force the green variant regardless of theme.
/// The sign-in screen does this so the brand mark stays in colour even
/// against a dark page — the white version reads as a dim grey there
/// and loses identity.
///
/// The native splash screens (Android `drawable` / `drawable-night`,
/// iOS `LaunchImage` luminosity variants) ship the same two images
/// independently — they have to render before the Flutter engine
/// boots — so when the engine takes over from the OS splash and shows
/// `WmLogo` somewhere, the user sees the same mark.
///
/// Sizes commonly seen: 28 (header), 56 (drawer), 64 (sign-in).
class WmLogo extends StatelessWidget {
  const WmLogo({super.key, this.size = 56, this.colored = false});

  final double size;

  /// When true, always renders the green/colored variant. When false
  /// (default), follows `Theme.of(context).brightness`.
  final bool colored;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final useWhite = isDark && !colored;
    final asset = useWhite
        ? 'assets/wimail-logo-white.png'
        : 'assets/wimail-logo.png';
    return Image.asset(
      asset,
      width: size,
      height: size,
      fit: BoxFit.contain,
      // Decode at the rendered density so a 28dp header doesn't ship
      // the full 1254px source through the rasteriser.
      cacheWidth: (size * MediaQuery.of(context).devicePixelRatio).round(),
    );
  }
}
