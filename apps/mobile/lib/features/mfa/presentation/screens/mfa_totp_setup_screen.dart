import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:qr_flutter/qr_flutter.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../../core/widgets/wm_app_bar.dart';
import '../../../../core/widgets/wm_primary_button.dart';
import '../../../auth/domain/mfa.dart';
import '../../../auth/presentation/providers/auth_controller.dart';
import '../widgets/wm_code_input.dart';

/// Mobile/MfaTotpSetup — design.lib.pen `SghRX`. Three-step flow:
/// open app → scan QR (or copy key) → enter 6-digit code. On successful
/// verify the API returns the freshly generated backup codes; we then
/// route to MfaBackupCodes to surface them once.
class MfaTotpSetupScreen extends ConsumerStatefulWidget {
  const MfaTotpSetupScreen({super.key});

  @override
  ConsumerState<MfaTotpSetupScreen> createState() => _MfaTotpSetupScreenState();
}

class _MfaTotpSetupScreenState extends ConsumerState<MfaTotpSetupScreen> {
  TotpSetupChallenge? _challenge;
  String _code = '';
  bool _verifying = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadChallenge();
  }

  Future<void> _loadChallenge() async {
    try {
      final repo = await ref.read(authRepositoryProvider.future);
      final c = await repo.beginTotpSetup();
      if (!mounted) return;
      setState(() => _challenge = c);
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = _format(e));
    }
  }

  Future<void> _verify() async {
    final c = _challenge;
    if (c == null || _code.length != 6) return;
    setState(() {
      _verifying = true;
      _error = null;
    });
    try {
      final repo = await ref.read(authRepositoryProvider.future);
      final result = await repo.verifyTotpSetup(methodId: c.methodId, code: _code);
      // Refresh user so the mfaSetupComplete banner disappears.
      await ref.read(authControllerProvider.notifier).refreshUser();
      if (!mounted) return;
      if (result.backupCodes != null && result.backupCodes!.isNotEmpty) {
        context.go(
          '/auth/mfa/setup/backup-codes',
          extra: result.backupCodes,
        );
      } else {
        context.go('/auth/mfa/methods');
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _verifying = false;
        _error = _format(e);
      });
    }
  }

  String _format(Object e) {
    final m = RegExp(r'ApiException\([^)]*\):\s*(.*)$').firstMatch(e.toString());
    return m != null ? m.group(1)! : 'Could not verify the code.';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: const WmAppBar(title: 'Authenticator app'),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(24, 16, 24, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _Step(
                index: 1,
                active: true,
                title: 'Open your authenticator app',
                subtitle:
                    'Google Authenticator, 1Password, Authy, or any TOTP-compatible app.',
              ),
              const SizedBox(height: 24),
              _Step(
                index: 2,
                active: _challenge != null,
                title: 'Scan this QR code',
                child: _challenge == null
                    ? const SizedBox(
                        height: 160,
                        child: Center(
                          child: SizedBox(
                            width: 22,
                            height: 22,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: AppColors.accent,
                            ),
                          ),
                        ),
                      )
                    : _QrSection(challenge: _challenge!),
              ),
              const SizedBox(height: 24),
              _Step(
                index: 3,
                active: _challenge != null,
                title: 'Enter the 6-digit code',
                child: Padding(
                  padding: const EdgeInsets.only(top: 12),
                  child: Align(
                    alignment: Alignment.centerLeft,
                    child: WmCodeInput(
                      autofocus: false,
                      onChanged: (v) => setState(() => _code = v),
                      onCompleted: (_) => _verify(),
                    ),
                  ),
                ),
              ),
              if (_error != null) ...[
                const SizedBox(height: 12),
                Text(
                  _error!,
                  style: AppTextStyles.bodySmall
                      .copyWith(color: AppColors.danger),
                ),
              ],
              const SizedBox(height: 24),
              WmPrimaryButton(
                label: 'Verify & continue',
                loading: _verifying,
                onPressed: _challenge != null && _code.length == 6 ? _verify : null,
              ),
              const SizedBox(height: 8),
            ],
          ),
        ),
      ),
    );
  }
}

class _Step extends StatelessWidget {
  const _Step({
    required this.index,
    required this.active,
    required this.title,
    this.subtitle,
    this.child,
  });
  final int index;
  final bool active;
  final String title;
  final String? subtitle;
  final Widget? child;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 24,
          height: 24,
          color: active ? AppColors.accentDim : AppColors.surface,
          alignment: Alignment.center,
          child: Text(
            '$index',
            style: GoogleFonts.jetBrainsMono(
              fontSize: 12,
              fontWeight: FontWeight.w700,
              color: active ? AppColors.accent : AppColors.textTertiary,
            ),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: GoogleFonts.inter(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: AppColors.textPrimary,
                ),
              ),
              if (subtitle != null) ...[
                const SizedBox(height: 4),
                Text(subtitle!,
                    style: AppTextStyles.bodySmall.copyWith(fontSize: 12)),
              ],
              if (child != null) ...[
                const SizedBox(height: 12),
                child!,
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class _QrSection extends StatelessWidget {
  const _QrSection({required this.challenge});
  final TotpSetupChallenge challenge;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // QR rendering of the otpauth:// URL — scannable by Google
        // Authenticator, 1Password, Authy, etc.
        Container(
          width: 160,
          height: 160,
          color: Colors.white,
          padding: const EdgeInsets.all(8),
          child: QrImageView(
            data: challenge.otpauthUrl,
            version: QrVersions.auto,
            backgroundColor: Colors.white,
            errorCorrectionLevel: QrErrorCorrectLevel.M,
            padding: EdgeInsets.zero,
          ),
        ),
        const SizedBox(height: 12),
        Text('Or enter this key manually',
            style: GoogleFonts.jetBrainsMono(
              fontSize: 11,
              color: AppColors.textTertiary,
            )),
        const SizedBox(height: 8),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: const BoxDecoration(
            color: AppColors.surface,
            border: Border.fromBorderSide(
              BorderSide(color: AppColors.border, width: 1),
            ),
          ),
          child: Row(
            children: [
              Expanded(
                child: SelectableText(
                  _grouped(challenge.secret),
                  style: GoogleFonts.jetBrainsMono(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: AppColors.textPrimary,
                    letterSpacing: 1,
                  ),
                ),
              ),
              GestureDetector(
                onTap: () async {
                  await Clipboard.setData(
                    ClipboardData(text: challenge.secret),
                  );
                  if (!context.mounted) return;
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('Copied'),
                      duration: Duration(seconds: 1),
                    ),
                  );
                },
                child: Row(
                  children: [
                    const Icon(Icons.copy,
                        size: 14, color: AppColors.accent),
                    const SizedBox(width: 6),
                    Text(
                      'Copy',
                      style: GoogleFonts.jetBrainsMono(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        color: AppColors.accent,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  String _grouped(String s) {
    final out = <String>[];
    for (int i = 0; i < s.length; i += 4) {
      out.add(s.substring(i, i + 4 > s.length ? s.length : i + 4));
    }
    return out.join(' ');
  }
}

