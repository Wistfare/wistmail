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
import '../../domain/mfa.dart';
import '../providers/auth_controller.dart';

/// Step 2 of the forgot-password flow — the user has the reset link
/// from email (or the raw token pasted in) and now sets a new
/// password. If the account has MFA enabled the server replies with
/// 412 on the first attempt, carrying a list of available factors;
/// we prompt for a code and retry.
///
/// Password policy mirrors the server: 8+ chars, at least one
/// uppercase, one lowercase, one digit. The checks render live so the
/// user fixes issues before hitting submit.
class ResetPasswordScreen extends ConsumerStatefulWidget {
  const ResetPasswordScreen({super.key, this.initialToken});

  /// Pre-populated when the route has `?token=…` (deep link or web
  /// fallback). Null when the user opened the screen via "Paste
  /// token" from the forgot-password page.
  final String? initialToken;

  @override
  ConsumerState<ResetPasswordScreen> createState() =>
      _ResetPasswordScreenState();
}

class _ResetPasswordScreenState extends ConsumerState<ResetPasswordScreen> {
  late final TextEditingController _tokenController;
  final _passwordController = TextEditingController();
  final _confirmController = TextEditingController();
  final _mfaController = TextEditingController();

  bool _submitting = false;
  bool _showMfa = false;
  bool _requestingCode = false;
  String _preferredMfa = 'totp';
  String? _error;

  @override
  void initState() {
    super.initState();
    _tokenController = TextEditingController(text: widget.initialToken ?? '');
  }

  @override
  void dispose() {
    _tokenController.dispose();
    _passwordController.dispose();
    _confirmController.dispose();
    _mfaController.dispose();
    super.dispose();
  }

  /// Accept either a raw token, a full reset URL
  /// (`https://site/reset-password?token=xxx`), or the token with
  /// whitespace / mail-client line wrapping.
  String _normalisedToken() {
    final raw = _tokenController.text.trim();
    if (raw.isEmpty) return '';
    try {
      final uri = Uri.tryParse(raw);
      if (uri != null && uri.queryParameters['token'] != null) {
        return uri.queryParameters['token']!.trim();
      }
    } catch (_) {
      // not a URL — fall through
    }
    return raw.replaceAll(RegExp(r'\s+'), '');
  }

  bool get _passwordValid {
    final p = _passwordController.text;
    return p.length >= 8 &&
        RegExp(r'[A-Z]').hasMatch(p) &&
        RegExp(r'[a-z]').hasMatch(p) &&
        RegExp(r'\d').hasMatch(p);
  }

  bool get _confirmMatches =>
      _confirmController.text == _passwordController.text &&
      _confirmController.text.isNotEmpty;

  Future<void> _submit() async {
    final token = _normalisedToken();
    if (token.isEmpty) {
      setState(() => _error = 'Paste the token (or link) from the email.');
      return;
    }
    if (!_passwordValid) {
      setState(() => _error = 'Password must meet all the rules below.');
      return;
    }
    if (!_confirmMatches) {
      setState(() => _error = "Passwords don't match.");
      return;
    }
    if (_showMfa && _mfaController.text.trim().isEmpty) {
      setState(() => _error = 'Enter the 6-digit code.');
      return;
    }

    final messenger = ScaffoldMessenger.of(context);
    final router = GoRouter.of(context);
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      final repo = await ref.read(authRepositoryProvider.future);
      final result = await repo.submitPasswordReset(
        token: token,
        newPassword: _passwordController.text,
        mfaCode: _showMfa ? _mfaController.text.trim() : null,
      );
      if (!mounted) return;
      switch (result) {
        case ResetPasswordDone():
          messenger.showSnackBar(
            const SnackBar(
              content: Text('Password changed. You can sign in now.'),
              backgroundColor: AppColors.success,
            ),
          );
          router.go('/auth/sign-in');
        case ResetPasswordNeedsMfa(:final methods):
          setState(() {
            _showMfa = true;
            _preferredMfa = methods.contains('totp')
                ? 'totp'
                : methods.contains('email')
                    ? 'email'
                    : methods.first;
            _error = null;
          });
      }
    } on DioException catch (e) {
      if (!mounted) return;
      final data = e.response?.data;
      String msg = 'Reset failed. Please try again.';
      if (data is Map<String, dynamic> &&
          data['error'] is Map<String, dynamic>) {
        final inner = data['error'] as Map<String, dynamic>;
        if (inner['message'] is String) msg = inner['message'] as String;
      }
      setState(() => _error = msg);
    } catch (_) {
      if (!mounted) return;
      setState(() => _error = 'Reset failed. Please try again.');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _requestEmailCode() async {
    final token = _normalisedToken();
    if (token.isEmpty || _requestingCode) return;
    final messenger = ScaffoldMessenger.of(context);
    setState(() => _requestingCode = true);
    try {
      final repo = await ref.read(authRepositoryProvider.future);
      await repo.requestResetEmailCode(token);
      if (!mounted) return;
      messenger.showSnackBar(
        const SnackBar(content: Text('We sent a fresh 6-digit code.')),
      );
    } catch (_) {
      if (!mounted) return;
      messenger.showSnackBar(
        const SnackBar(
          content: Text("Couldn't send code. Try again."),
          backgroundColor: AppColors.danger,
        ),
      );
    } finally {
      if (mounted) setState(() => _requestingCode = false);
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
                _showMfa ? 'Verify it\'s you' : 'Set a new password',
                style: AppTextStyles.headlineMedium,
              ),
              const SizedBox(height: 8),
              Text(
                _showMfa
                    ? 'Your account has two-factor auth. Enter a code to finish changing your password.'
                    : 'Paste the reset token (or full link) from the email, then pick a new password.',
                style: AppTextStyles.bodySmall.copyWith(height: 1.55),
              ),
              const SizedBox(height: 24),
              if (!_showMfa) ...[
                WmTextField(
                  label: 'Reset token or link',
                  controller: _tokenController,
                  hint: 'https://…/reset-password?token=…',
                  prefixIcon: Icons.vpn_key_outlined,
                ),
                const SizedBox(height: 16),
                WmTextField(
                  label: 'New Password',
                  controller: _passwordController,
                  hint: 'At least 8 characters',
                  prefixIcon: Icons.lock_outline,
                  isPassword: true,
                  autofillHints: const [AutofillHints.newPassword],
                  onChanged: (_) => setState(() {}),
                ),
                const SizedBox(height: 6),
                _PolicyHints(password: _passwordController.text),
                const SizedBox(height: 12),
                WmTextField(
                  label: 'Confirm Password',
                  controller: _confirmController,
                  hint: 'Re-enter it',
                  prefixIcon: Icons.lock_outline,
                  isPassword: true,
                  onChanged: (_) => setState(() {}),
                ),
              ] else ...[
                Text(
                  _preferredMfa == 'email'
                      ? 'Enter the 6-digit code from your recovery email.'
                      : _preferredMfa == 'backup'
                          ? 'Enter a backup code.'
                          : 'Enter the 6-digit code from your authenticator app.',
                  style: GoogleFonts.jetBrainsMono(
                    fontSize: 12,
                    color: AppColors.textSecondary,
                  ),
                ),
                const SizedBox(height: 12),
                WmTextField(
                  label: 'Code',
                  controller: _mfaController,
                  hint: '123456',
                  prefixIcon: Icons.shield_outlined,
                  keyboardType: TextInputType.number,
                ),
                if (_preferredMfa == 'email') ...[
                  const SizedBox(height: 8),
                  Align(
                    alignment: Alignment.centerLeft,
                    child: TextButton(
                      onPressed: _requestingCode ? null : _requestEmailCode,
                      child: Text(
                        _requestingCode ? 'Sending…' : 'Send me a new code',
                        style: GoogleFonts.jetBrainsMono(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: AppColors.accent,
                        ),
                      ),
                    ),
                  ),
                ],
              ],
              if (_error != null) ...[
                const SizedBox(height: 12),
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
                label: _showMfa ? 'Verify & reset' : 'Reset password',
                loading: _submitting,
                onPressed: _submitting ? null : _submit,
              ),
              const SizedBox(height: 32),
              Center(
                child: TextButton(
                  onPressed: () => context.go('/auth/sign-in'),
                  child: Text(
                    'Back to sign in',
                    style: GoogleFonts.jetBrainsMono(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: AppColors.textSecondary,
                    ),
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

class _PolicyHints extends StatelessWidget {
  const _PolicyHints({required this.password});
  final String password;

  @override
  Widget build(BuildContext context) {
    final hasLen = password.length >= 8;
    final hasUpper = RegExp(r'[A-Z]').hasMatch(password);
    final hasLower = RegExp(r'[a-z]').hasMatch(password);
    final hasDigit = RegExp(r'\d').hasMatch(password);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _hint('8+ characters', hasLen),
        _hint('One uppercase letter', hasUpper),
        _hint('One lowercase letter', hasLower),
        _hint('One digit', hasDigit),
      ],
    );
  }

  Widget _hint(String text, bool ok) {
    final color = ok ? AppColors.success : AppColors.textMuted;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 1),
      child: Row(
        children: [
          Icon(
            ok ? Icons.check_circle_outline : Icons.radio_button_unchecked,
            size: 13,
            color: color,
          ),
          const SizedBox(width: 6),
          Text(
            text,
            style: GoogleFonts.jetBrainsMono(fontSize: 11, color: color),
          ),
        ],
      ),
    );
  }
}
