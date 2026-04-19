import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../../core/widgets/wm_app_bar.dart';
import '../../../../core/widgets/wm_primary_button.dart';
import '../../../../core/widgets/wm_text_field.dart';

/// Mobile/ForgotPassword — design.lib.pen node `Ikmb8`.
class ForgotPasswordScreen extends StatefulWidget {
  const ForgotPasswordScreen({super.key});

  @override
  State<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends State<ForgotPasswordScreen> {
  final _emailController = TextEditingController();

  @override
  void dispose() {
    _emailController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: const WmAppBar(divider: false),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(24, 0, 24, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('Reset Password', style: AppTextStyles.headlineMedium),
              const SizedBox(height: 8),
              Text(
                "Enter your email address and we'll send you a link to reset your password.",
                style: AppTextStyles.bodySmall.copyWith(height: 1.55),
              ),
              const SizedBox(height: 40),
              const Center(
                child: _MailGlyph(),
              ),
              const SizedBox(height: 40),
              WmTextField(
                label: 'Email Address',
                controller: _emailController,
                hint: 'you@wistfare.com',
                prefixIcon: Icons.mail_outline,
                keyboardType: TextInputType.emailAddress,
                autofillHints: const [AutofillHints.email],
              ),
              const SizedBox(height: 20),
              WmPrimaryButton(
                label: 'Send Reset Link',
                onPressed: () {
                  // TODO: wire to /api/v1/auth/forgot-password
                },
              ),
              const SizedBox(height: 64),
              Center(
                child: RichText(
                  text: TextSpan(
                    style: AppTextStyles.bodySmall,
                    children: [
                      const TextSpan(text: 'Remember your password? '),
                      WidgetSpan(
                        alignment: PlaceholderAlignment.middle,
                        child: GestureDetector(
                          onTap: () => context.pop(),
                          child: Text(
                            'Sign In',
                            style: GoogleFonts.jetBrainsMono(
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                              color: AppColors.accent,
                            ),
                          ),
                        ),
                      ),
                    ],
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

/// Square lime-tinted card with mail glyph (design `Ikmb8` central icon).
class _MailGlyph extends StatelessWidget {
  const _MailGlyph();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 64,
      height: 64,
      color: AppColors.accentDim,
      child: const Icon(
        Icons.mail_outline,
        color: AppColors.accent,
        size: 26,
      ),
    );
  }
}
