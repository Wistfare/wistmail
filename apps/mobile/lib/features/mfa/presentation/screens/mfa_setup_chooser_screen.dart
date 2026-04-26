import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../../core/theme/contrast.dart';
import '../../../../core/widgets/wm_app_bar.dart';

/// Mobile/MfaSetupChooser — design.lib.pen `lkTsC`. Lists the methods
/// the user can enable. Phone is intentionally disabled — backend hasn't
/// shipped SMS yet.
class MfaSetupChooserScreen extends StatelessWidget {
  const MfaSetupChooserScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: const WmAppBar(title: 'Secure your account'),
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 8, 24, 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Add a security factor',
                      style: AppTextStyles.headlineMedium),
                  const SizedBox(height: 8),
                  Text(
                    'Required for your account. Pick a method to start. You can add more later.',
                    style: AppTextStyles.bodySmall.copyWith(height: 1.55),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: Column(
                children: [
                  _MethodCard(
                    icon: Icons.smartphone,
                    title: 'Authenticator app',
                    subtitle: 'Google Authenticator, 1Password, Authy',
                    recommended: true,
                    onTap: () => context.push('/auth/mfa/setup/totp'),
                  ),
                  const SizedBox(height: 12),
                  _MethodCard(
                    icon: Icons.mail_outline,
                    title: 'Backup email',
                    subtitle: 'Send recovery codes to a second address',
                    onTap: () => context.push('/auth/mfa/setup/email'),
                  ),
                  const SizedBox(height: 12),
                  _MethodCard(
                    icon: Icons.phone_outlined,
                    title: 'Phone (SMS)',
                    subtitle: 'Receive a code via text message',
                    disabled: true,
                    badge: 'COMING SOON',
                  ),
                ],
              ),
            ),
            const Spacer(),
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 16, 24, 32),
              child: Center(
                child: Text(
                  'You can change methods anytime in Settings.',
                  style: GoogleFonts.jetBrainsMono(
                    fontSize: 11,
                    color: AppColors.textTertiary,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _MethodCard extends StatelessWidget {
  const _MethodCard({
    required this.icon,
    required this.title,
    required this.subtitle,
    this.onTap,
    this.recommended = false,
    this.disabled = false,
    this.badge,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback? onTap;
  final bool recommended;
  final bool disabled;
  final String? badge;

  @override
  Widget build(BuildContext context) {
    final fg = disabled ? AppColors.textTertiary : AppColors.textPrimary;
    final iconColor = disabled
        ? AppColors.textTertiary
        : recommended
            ? AppColors.accent
            : AppColors.textSecondary;
    final iconBg = recommended ? AppColors.accentDim : AppColors.surface;

    return Material(
      color: AppColors.surface,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: disabled ? null : onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: recommended ? AppColors.accent : AppColors.border,
              width: 1,
            ),
          ),
          child: Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: iconBg,
                  borderRadius: BorderRadius.circular(8),
                ),
                alignment: Alignment.center,
                child: Icon(icon, size: 18, color: iconColor),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: GoogleFonts.inter(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: fg,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      subtitle,
                      style: GoogleFonts.jetBrainsMono(
                        fontSize: 11,
                        color: disabled
                            ? AppColors.textTertiary
                            : AppColors.textSecondary,
                      ),
                    ),
                  ],
                ),
              ),
              // Status chip lives on the right edge; chevron retired in
              // favor of the chip + tap-anywhere row affordance.
              if (recommended)
                Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(
                    color: AppColors.accent,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    'RECOMMENDED',
                    style: GoogleFonts.jetBrainsMono(
                      fontSize: 9,
                      fontWeight: FontWeight.w700,
                      color: readableOn(AppColors.accent),
                    ),
                  ),
                )
              else if (badge != null)
                Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(
                    border: Border.all(
                      color: AppColors.textTertiary,
                      width: 1,
                    ),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    badge!,
                    style: GoogleFonts.jetBrainsMono(
                      fontSize: 9,
                      fontWeight: FontWeight.w700,
                      color: AppColors.textTertiary,
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
