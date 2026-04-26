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

/// Mobile/MfaEmailSetup — design.lib.pen `sYQpz`. Two-state screen:
/// (1) ask for the address, (2) ask for the 6-digit code we just sent.
class MfaEmailSetupScreen extends ConsumerStatefulWidget {
  const MfaEmailSetupScreen({super.key});

  @override
  ConsumerState<MfaEmailSetupScreen> createState() =>
      _MfaEmailSetupScreenState();
}

class _MfaEmailSetupScreenState extends ConsumerState<MfaEmailSetupScreen> {
  final _addressController = TextEditingController(text: 'recovery@gmail.com');
  String? _methodId;
  String _code = '';
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _addressController.dispose();
    super.dispose();
  }

  Future<void> _sendCode() async {
    final addr = _addressController.text.trim();
    if (!RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(addr)) {
      setState(() => _error = 'Enter a valid email address');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final repo = await ref.read(authRepositoryProvider.future);
      final id = await repo.beginEmailSetup(addr);
      if (!mounted) return;
      setState(() {
        _busy = false;
        _methodId = id;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = _format(e);
      });
    }
  }

  Future<void> _verifyCode() async {
    final id = _methodId;
    if (id == null || _code.length != 6) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final repo = await ref.read(authRepositoryProvider.future);
      final result = await repo.verifyEmailSetup(methodId: id, code: _code);
      await ref.read(authControllerProvider.notifier).refreshUser();
      if (!mounted) return;
      if (result.backupCodes != null && result.backupCodes!.isNotEmpty) {
        context.go('/auth/mfa/setup/backup-codes', extra: result.backupCodes);
      } else {
        context.go('/auth/mfa/methods');
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = _format(e);
      });
    }
  }

  String _format(Object e) {
    final m = RegExp(r'ApiException\([^)]*\):\s*(.*)$').firstMatch(e.toString());
    return m != null ? m.group(1)! : 'Could not save email.';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: const WmAppBar(title: 'Backup email'),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(24, 16, 24, 24),
          child: _methodId == null ? _addressForm(context) : _codeForm(context),
        ),
      ),
    );
  }

  Widget _addressForm(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('Add a backup address', style: AppTextStyles.headlineMedium),
        const SizedBox(height: 8),
        Text(
          "We'll send a 6-digit code here whenever you sign in or reset your password.",
          style: AppTextStyles.bodySmall.copyWith(height: 1.55),
        ),
        const SizedBox(height: 24),
        Text('EMAIL ADDRESS',
            style: GoogleFonts.jetBrainsMono(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: AppColors.textSecondary,
              letterSpacing: 0.8,
            )),
        const SizedBox(height: 10),
        Container(
          decoration: BoxDecoration(
            color: AppColors.surface,
            border: const Border.fromBorderSide(
              BorderSide(color: AppColors.border, width: 1),
            ),
            borderRadius: BorderRadius.circular(12),
          ),
          padding: const EdgeInsets.symmetric(horizontal: 14),
          child: Row(
            children: [
              const Icon(Icons.mail_outline,
                  size: 16, color: AppColors.textTertiary),
              const SizedBox(width: 10),
              Expanded(
                child: TextField(
                  controller: _addressController,
                  autofocus: true,
                  keyboardType: TextInputType.emailAddress,
                  cursorColor: AppColors.accent,
                  style: GoogleFonts.jetBrainsMono(
                    fontSize: 13,
                    color: AppColors.textPrimary,
                  ),
                  decoration: InputDecoration(
                    hintText: 'recovery@gmail.com',
                    hintStyle: GoogleFonts.jetBrainsMono(
                      fontSize: 13,
                      color: AppColors.textTertiary,
                    ),
                    border: InputBorder.none,
                    isCollapsed: true,
                    contentPadding: const EdgeInsets.symmetric(vertical: 14),
                  ),
                ),
              ),
            ],
          ),
        ),
        if (_error != null) ...[
          const SizedBox(height: 12),
          Text(_error!,
              style:
                  AppTextStyles.bodySmall.copyWith(color: AppColors.danger)),
        ],
        const SizedBox(height: 24),
        WmPrimaryButton(
          label: 'Send verification code',
          loading: _busy,
          onPressed: _sendCode,
        ),
        const SizedBox(height: 16),
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: AppColors.surface,
            border: const Border.fromBorderSide(
              BorderSide(color: AppColors.border, width: 1),
            ),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Icon(Icons.info_outlined,
                  color: AppColors.textSecondary, size: 16),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  'This address is only used for security. We never send marketing here and never share it.',
                  style: AppTextStyles.bodySmall.copyWith(fontSize: 12),
                ),
              ),
            ],
          ),
        ),
        const Spacer(),
        Center(
          child: Text(
            'Codes expire after 10 minutes',
            style: GoogleFonts.jetBrainsMono(
              fontSize: 11,
              color: AppColors.textTertiary,
            ),
          ),
        ),
      ],
    );
  }

  Widget _codeForm(BuildContext context) {
    return Column(
      children: [
        const SizedBox(height: 16),
        Text('Enter the code',
            style: AppTextStyles.headlineMedium, textAlign: TextAlign.center),
        const SizedBox(height: 8),
        Text(
          'We sent a 6-digit code to\n${_addressController.text.trim()}',
          style: AppTextStyles.bodySmall.copyWith(height: 1.5),
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 32),
        WmCodeInput(
          onChanged: (v) => setState(() => _code = v),
          onCompleted: (_) => _verifyCode(),
        ),
        if (_error != null) ...[
          const SizedBox(height: 12),
          Text(_error!,
              style:
                  AppTextStyles.bodySmall.copyWith(color: AppColors.danger),
              textAlign: TextAlign.center),
        ],
        const SizedBox(height: 24),
        WmPrimaryButton(
          label: 'Verify & continue',
          loading: _busy,
          onPressed: _code.length == 6 ? _verifyCode : null,
        ),
        const SizedBox(height: 16),
        GestureDetector(
          onTap: _busy
              ? null
              : () {
                  setState(() {
                    _methodId = null;
                    _code = '';
                    _error = null;
                  });
                },
          child: Text(
            'Use a different email',
            style: GoogleFonts.jetBrainsMono(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: AppColors.accent,
            ),
          ),
        ),
        const Spacer(),
      ],
    );
  }
}
