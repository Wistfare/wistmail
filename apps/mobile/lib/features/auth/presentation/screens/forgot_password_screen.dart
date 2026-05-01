import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../../core/widgets/wm_app_bar.dart';
import '../../../../core/widgets/wm_primary_button.dart';
import '../../../../core/widgets/wm_text_field.dart';
import '../providers/auth_controller.dart';

/// Two-step reset-password flow — step 1 (this screen) collects the
/// email and asks the API to mail out a reset link. When the mail
/// arrives the user can either (a) tap the web link to finish on
/// wistfare.com, or (b) copy the token out of the email and paste it
/// into `/auth/reset-password` on mobile.
///
/// We deliberately keep the "paste the token" affordance visible after
/// sending the link — mail clients on iOS/Android don't reliably
/// deep-link into a third-party app without a properly provisioned
/// App Link / Universal Link, and rolling that out is a separate piece
/// of work. Paste-from-email is the lowest-friction path that works
/// today.
class ForgotPasswordScreen extends ConsumerStatefulWidget {
  const ForgotPasswordScreen({super.key});

  @override
  ConsumerState<ForgotPasswordScreen> createState() =>
      _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends ConsumerState<ForgotPasswordScreen> {
  final _emailController = TextEditingController();
  bool _submitting = false;
  bool _sent = false;
  String? _error;

  @override
  void dispose() {
    _emailController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final email = _emailController.text.trim();
    if (email.isEmpty || !email.contains('@')) {
      setState(() => _error = 'Please enter a valid email address.');
      return;
    }
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      final repo = await ref.read(authRepositoryProvider.future);
      await repo.requestPasswordReset(email);
      if (!mounted) return;
      setState(() => _sent = true);
    } on DioException catch (e) {
      if (!mounted) return;
      if (e.response?.statusCode == 429) {
        setState(() => _error = 'Too many requests. Please try again later.');
      } else {
        setState(() => _error = 'Something went wrong. Please try again.');
      }
    } catch (_) {
      if (!mounted) return;
      setState(() => _error = 'Something went wrong. Please try again.');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
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
              Text(
                _sent ? 'Check your email' : 'Reset Password',
                style: AppTextStyles.headlineMedium,
              ),
              const SizedBox(height: 8),
              Text(
                _sent
                    ? "We sent a reset link to ${_emailController.text.trim()}. It expires in 30 minutes."
                    : "Enter your email address and we'll send you a link to reset your password.",
                style: AppTextStyles.bodySmall.copyWith(height: 1.55),
              ),
              const SizedBox(height: 40),
              const Center(child: _MailGlyph()),
              const SizedBox(height: 40),
              if (!_sent) ...[
                WmTextField(
                  label: 'Email Address',
                  controller: _emailController,
                  hint: 'you@wistfare.com',
                  prefixIcon: Icons.mail_outline,
                  keyboardType: TextInputType.emailAddress,
                  autofillHints: const [AutofillHints.email],
                ),
                if (_error != null) ...[
                  const SizedBox(height: 8),
                  Text(
                    _error!,
                    style: GoogleFonts.jetBrainsMono(
                      fontSize: 11,
                      color: AppColors.danger,
                    ),
                  ),
                ],
                const SizedBox(height: 20),
                WmPrimaryButton(
                  label: 'Send Reset Link',
                  loading: _submitting,
                  onPressed: _submitting ? null : _submit,
                ),
              ] else ...[
                // Paste-token affordance. Users on iOS/Android open
                // the email in their Mail client, long-press the
                // token / link, and bring it back. No scheme handler
                // needed.
                _PasteTokenCta(
                  onTap: () => context.push('/auth/reset-password'),
                ),
                const SizedBox(height: 12),
                Center(
                  child: TextButton(
                    onPressed: () {
                      setState(() {
                        _sent = false;
                        _error = null;
                      });
                    },
                    child: Text(
                      'Use a different email',
                      style: GoogleFonts.jetBrainsMono(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: AppColors.textSecondary,
                      ),
                    ),
                  ),
                ),
              ],
              const SizedBox(height: 48),
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

class _PasteTokenCta extends StatelessWidget {
  const _PasteTokenCta({required this.onTap});
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppColors.surface,
          border: Border.all(color: AppColors.border),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          children: [
            const Icon(Icons.content_paste_go_outlined,
                size: 22, color: AppColors.accent),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    'Paste token from the email',
                    style: GoogleFonts.inter(
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      color: AppColors.textPrimary,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    'Copy the link or token from the message we just sent.',
                    style: GoogleFonts.inter(
                      fontSize: 12,
                      color: AppColors.textSecondary,
                    ),
                  ),
                ],
              ),
            ),
            const Icon(Icons.chevron_right,
                color: AppColors.textMuted, size: 20),
          ],
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
      decoration: BoxDecoration(
        color: AppColors.accentDim,
        borderRadius: BorderRadius.circular(14),
      ),
      child: const Icon(
        Icons.mail_outline,
        color: AppColors.accent,
        size: 26,
      ),
    );
  }
}
