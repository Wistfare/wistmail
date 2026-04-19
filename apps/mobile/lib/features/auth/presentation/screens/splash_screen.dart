import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/wm_logo.dart';
import '../providers/auth_controller.dart';

/// Lightweight branded splash shown only while the auth controller is
/// restoring a saved session. As soon as `isRestoring` flips false, we
/// redirect to the inbox or sign-in. No spinner — the lime logo alone
/// signals "the app is loading".
class SplashScreen extends ConsumerWidget {
  const SplashScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    ref.listen<AuthState>(authControllerProvider, (prev, next) {
      if (next.isRestoring) return;
      if (next.isAuthenticated) {
        context.go('/inbox');
      } else {
        context.go('/auth/sign-in');
      }
    });

    return const Scaffold(
      backgroundColor: AppColors.background,
      body: Center(child: WmLogo(size: 56)),
    );
  }
}
