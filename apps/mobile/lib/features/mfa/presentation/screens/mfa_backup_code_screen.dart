import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../../core/widgets/wm_app_bar.dart';
import '../../../../core/widgets/wm_primary_button.dart';
import '../../../auth/presentation/providers/auth_controller.dart';

/// Mobile/MfaBackupCode — design.lib.pen `90wY4`. Single mono input
/// for an 8-character recovery code. Submits via the same verifyMfa()
/// path as TOTP — backend dispatcher tries every factor in order.
class MfaBackupCodeScreen extends ConsumerStatefulWidget {
  const MfaBackupCodeScreen({super.key});

  @override
  ConsumerState<MfaBackupCodeScreen> createState() =>
      _MfaBackupCodeScreenState();
}

class _MfaBackupCodeScreenState extends ConsumerState<MfaBackupCodeScreen> {
  final _controller = TextEditingController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  String _normalize(String v) =>
      v.replaceAll(RegExp(r'[^A-Za-z0-9]'), '').toUpperCase();

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(authControllerProvider);
    final raw = _normalize(_controller.text);

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: const WmAppBar(title: 'Use a backup code'),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(24, 16, 24, 24),
          child: Column(
            children: [
              const SizedBox(height: 24),
              const _Glyph(),
              const SizedBox(height: 24),
              Text(
                'Recovery code',
                style: AppTextStyles.headlineMedium,
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 8),
              Text(
                'Enter one of your 8-character\nbackup codes.',
                style: AppTextStyles.bodySmall.copyWith(height: 1.5),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 32),
              Container(
                width: double.infinity,
                height: 56,
                decoration: BoxDecoration(
                  color: AppColors.surface,
                  border: const Border.fromBorderSide(
                    BorderSide(color: AppColors.accent, width: 1),
                  ),
                  borderRadius: BorderRadius.circular(12),
                ),
                alignment: Alignment.center,
                child: TextField(
                  controller: _controller,
                  autofocus: true,
                  textAlign: TextAlign.center,
                  textCapitalization: TextCapitalization.characters,
                  cursorColor: AppColors.accent,
                  style: GoogleFonts.jetBrainsMono(
                    fontSize: 18,
                    fontWeight: FontWeight.w600,
                    color: AppColors.textPrimary,
                    letterSpacing: 1.5,
                  ),
                  decoration: InputDecoration(
                    hintText: 'XXXX-XXXX',
                    hintStyle: GoogleFonts.jetBrainsMono(
                      fontSize: 18,
                      color: AppColors.textTertiary,
                      letterSpacing: 1.5,
                    ),
                    border: InputBorder.none,
                    isCollapsed: true,
                    contentPadding: EdgeInsets.zero,
                  ),
                  onChanged: (_) => setState(() {}),
                  onSubmitted: (_) => _submit(),
                ),
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
              const SizedBox(height: 20),
              WmPrimaryButton(
                label: 'Verify',
                loading: state.isLoading,
                onPressed: raw.length >= 8 ? _submit : null,
              ),
              const SizedBox(height: 20),
              GestureDetector(
                onTap: () => context.pop(),
                child: Text(
                  'Use authenticator instead',
                  style: GoogleFonts.jetBrainsMono(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: AppColors.accent,
                  ),
                ),
              ),
              const Spacer(),
              Text(
                'Each backup code can only be used once.',
                style: GoogleFonts.jetBrainsMono(
                  fontSize: 11,
                  color: AppColors.textTertiary,
                ),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _submit() async {
    final code = _normalize(_controller.text);
    if (code.length < 8) return;
    final ok = await ref.read(authControllerProvider.notifier).verifyMfa(code);
    if (!mounted) return;
    if (ok) context.go('/inbox');
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
        Icons.vpn_key_outlined,
        color: AppColors.accent,
        size: 26,
      ),
    );
  }
}
