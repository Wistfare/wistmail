import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../../core/widgets/wm_app_bar.dart';
import '../../../../core/widgets/wm_primary_button.dart';
import '../../../auth/presentation/providers/auth_controller.dart';
import '../widgets/wm_code_input.dart';

/// Mobile/MfaChallenge — design.lib.pen `7GmHH`. Step 2 of login. Reads
/// the pending challenge from authControllerProvider and submits the
/// 6-digit code via verifyMfa(). Offers fallback links to backup-code
/// and email methods (each only if the user has that factor configured).
class MfaChallengeScreen extends ConsumerStatefulWidget {
  const MfaChallengeScreen({super.key});

  @override
  ConsumerState<MfaChallengeScreen> createState() => _MfaChallengeScreenState();
}

class _MfaChallengeScreenState extends ConsumerState<MfaChallengeScreen> {
  String _code = '';
  bool _emailSending = false;

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(authControllerProvider);
    final challenge = state.pendingMfa;

    // If the controller already cleared the challenge (e.g. successful
    // verify) the router will navigate us away on the next frame. Keep
    // the layout but show empty state in the meantime.
    final hasTotp = challenge?.hasTotp ?? false;
    final hasEmail = challenge?.hasEmail ?? false;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: WmAppBar(
        title: 'Verify it\'s you',
        onBack: () {
          ref.read(authControllerProvider.notifier).cancelMfa();
          context.go('/auth/sign-in');
        },
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(24, 16, 24, 24),
          child: Column(
            children: [
              const SizedBox(height: 24),
              const _Glyph(),
              const SizedBox(height: 24),
              Text(
                'Two-factor required',
                style: AppTextStyles.headlineMedium,
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 8),
              Text(
                hasTotp
                    ? 'Enter the 6-digit code from your\nauthenticator app'
                    : 'Enter the 6-digit code we sent\nto your backup email',
                style: AppTextStyles.bodySmall.copyWith(height: 1.5),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 32),
              WmCodeInput(
                onChanged: (v) => setState(() => _code = v),
                onCompleted: (_) => _submit(),
              ),
              if (state.errorMessage != null) ...[
                const SizedBox(height: 12),
                Text(
                  state.errorMessage!,
                  style: AppTextStyles.bodySmall
                      .copyWith(color: AppColors.danger),
                  textAlign: TextAlign.center,
                ),
              ],
              const SizedBox(height: 24),
              WmPrimaryButton(
                label: 'Verify',
                loading: state.isLoading,
                onPressed: _code.length == 6 ? _submit : null,
              ),
              const SizedBox(height: 20),
              GestureDetector(
                onTap: () => context.push('/auth/mfa/backup-code'),
                child: Text(
                  'Use a backup code',
                  style: GoogleFonts.jetBrainsMono(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: AppColors.accent,
                  ),
                ),
              ),
              const Spacer(),
              if (hasEmail && hasTotp)
                GestureDetector(
                  onTap: _emailSending ? null : _sendEmailCode,
                  child: Text(
                    _emailSending ? 'Sending email...' : 'Email me a code instead',
                    style: GoogleFonts.jetBrainsMono(
                      fontSize: 11,
                      color: AppColors.textTertiary,
                    ),
                    textAlign: TextAlign.center,
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _submit() async {
    if (_code.length != 6) return;
    final ok = await ref.read(authControllerProvider.notifier).verifyMfa(_code);
    if (!mounted) return;
    if (ok) context.go('/inbox');
  }

  Future<void> _sendEmailCode() async {
    setState(() => _emailSending = true);
    final ok =
        await ref.read(authControllerProvider.notifier).requestMfaEmailCode();
    if (!mounted) return;
    setState(() => _emailSending = false);
    if (ok) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Code sent. Check your backup email.'),
          duration: Duration(seconds: 3),
        ),
      );
    }
  }
}

class _Glyph extends StatelessWidget {
  const _Glyph();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 64,
      height: 64,
      decoration: BoxDecoration(
        color: AppColors.accentDim,
        borderRadius: BorderRadius.circular(14),
      ),
      alignment: Alignment.center,
      child: const Icon(
        Icons.shield_outlined,
        color: AppColors.accent,
        size: 28,
      ),
    );
  }
}
