import 'package:flutter/material.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/wm_logo.dart';

/// Launch splash — shown during `AuthController._restore()` so we don't
/// flash a protected route (e.g. Today) before the session check
/// completes. As soon as `isRestoring` flips to false the router
/// redirects the user to `/today` (authenticated) or `/auth/sign-in`.
///
/// Intentionally minimal: black background + the brand mark centred.
/// No spinner — the restore typically takes <300ms and a flashing
/// spinner reads as jankier than a held-frame.
class WmSplashScreen extends StatelessWidget {
  const WmSplashScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      backgroundColor: AppColors.background,
      body: Center(child: WmLogo(size: 80)),
    );
  }
}
