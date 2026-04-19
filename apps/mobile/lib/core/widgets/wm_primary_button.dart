import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../theme/app_colors.dart';

/// Primary CTA button — solid lime square block with black text.
/// Matches Mobile/SignIn "Sign In", Mobile/ForgotPassword "Send Reset Link",
/// Mobile/JoinMeeting "Join Meeting", Mobile/Compose "Send".
class WmPrimaryButton extends StatelessWidget {
  const WmPrimaryButton({
    super.key,
    required this.label,
    this.onPressed,
    this.icon,
    this.isFullWidth = true,
    this.loading = false,
    this.height = 52,
  });

  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final bool isFullWidth;
  final bool loading;
  final double height;

  @override
  Widget build(BuildContext context) {
    final textStyle = GoogleFonts.inter(
      fontSize: 15,
      fontWeight: FontWeight.w600,
      color: AppColors.background,
    );

    final content = loading
        ? SizedBox(
            width: 18,
            height: 18,
            child: CircularProgressIndicator(
              strokeWidth: 2,
              color: AppColors.background,
            ),
          )
        : icon != null
            ? Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(icon, size: 16, color: AppColors.background),
                  const SizedBox(width: 8),
                  Text(label, style: textStyle),
                ],
              )
            : Text(label, style: textStyle);

    return Material(
      color: AppColors.accent,
      child: InkWell(
        onTap: loading ? null : onPressed,
        splashColor: AppColors.background.withValues(alpha: 0.06),
        highlightColor: AppColors.background.withValues(alpha: 0.04),
        child: SizedBox(
          height: height,
          width: isFullWidth ? double.infinity : null,
          child: Center(child: content),
        ),
      ),
    );
  }
}

/// Secondary outlined block — gray border on dark surface.
class WmSecondaryButton extends StatelessWidget {
  const WmSecondaryButton({
    super.key,
    required this.label,
    this.onPressed,
    this.icon,
    this.isFullWidth = true,
    this.height = 52,
  });

  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final bool isFullWidth;
  final double height;

  @override
  Widget build(BuildContext context) {
    final textStyle = GoogleFonts.inter(
      fontSize: 14,
      fontWeight: FontWeight.w600,
      color: AppColors.textPrimary,
    );

    return Material(
      color: AppColors.surface,
      child: InkWell(
        onTap: onPressed,
        splashColor: AppColors.textPrimary.withValues(alpha: 0.04),
        highlightColor: AppColors.textPrimary.withValues(alpha: 0.02),
        child: Container(
          height: height,
          width: isFullWidth ? double.infinity : null,
          decoration: const BoxDecoration(
            border: Border.fromBorderSide(
              BorderSide(color: AppColors.border, width: 1),
            ),
          ),
          alignment: Alignment.center,
          child: icon != null
              ? Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(icon, size: 16, color: AppColors.textPrimary),
                    const SizedBox(width: 8),
                    Text(label, style: textStyle),
                  ],
                )
              : Text(label, style: textStyle),
        ),
      ),
    );
  }
}

/// Danger button — solid red block. Used by DeleteAccount, "End call".
class WmDangerButton extends StatelessWidget {
  const WmDangerButton({
    super.key,
    required this.label,
    this.onPressed,
    this.icon,
    this.isFullWidth = true,
    this.height = 52,
  });

  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final bool isFullWidth;
  final double height;

  @override
  Widget build(BuildContext context) {
    final textStyle = GoogleFonts.inter(
      fontSize: 15,
      fontWeight: FontWeight.w600,
      color: Colors.white,
    );

    return Material(
      color: AppColors.danger,
      child: InkWell(
        onTap: onPressed,
        child: SizedBox(
          height: height,
          width: isFullWidth ? double.infinity : null,
          child: Center(
            child: icon != null
                ? Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(icon, size: 16, color: Colors.white),
                      const SizedBox(width: 8),
                      Text(label, style: textStyle),
                    ],
                  )
                : Text(label, style: textStyle),
          ),
        ),
      ),
    );
  }
}
