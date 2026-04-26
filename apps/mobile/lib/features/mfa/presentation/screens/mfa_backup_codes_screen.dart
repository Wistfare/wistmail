import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../../core/widgets/wm_app_bar.dart';
import '../../../../core/widgets/wm_primary_button.dart';

/// Mobile/MfaBackupCodes — design.lib.pen `8moQw`. Shown ONCE after the
/// user finishes their first MFA enrollment. Displays the 10 codes,
/// offers Copy / Download, requires explicit acknowledgement before
/// leaving.
class MfaBackupCodesScreen extends StatelessWidget {
  const MfaBackupCodesScreen({super.key, required this.codes});

  final List<String> codes;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: const WmAppBar(title: 'Backup codes', showBack: false),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(24, 8, 24, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('Save these codes', style: AppTextStyles.headlineMedium),
              const SizedBox(height: 8),
              Text(
                'Use one if you ever lose access to your authenticator. Each code works once.',
                style: AppTextStyles.bodySmall.copyWith(height: 1.55),
              ),
              const SizedBox(height: 16),
              _Warning(),
              const SizedBox(height: 16),
              _CodeGrid(codes: codes),
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(
                    child: _OutlinedAction(
                      icon: Icons.copy,
                      label: 'Copy all',
                      onTap: () async {
                        await Clipboard.setData(
                          ClipboardData(text: codes.join('\n')),
                        );
                        if (!context.mounted) return;
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(
                            content: Text('Codes copied to clipboard'),
                            duration: Duration(seconds: 2),
                          ),
                        );
                      },
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: _OutlinedAction(
                      icon: Icons.download,
                      label: 'Download .txt',
                      onTap: () {
                        // Download path requires file_picker — ship later.
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(
                            content: Text('Coming soon — copy them for now'),
                            duration: Duration(seconds: 2),
                          ),
                        );
                      },
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 24),
              WmPrimaryButton(
                label: "I've saved them safely",
                onPressed: () => context.go('/auth/mfa/methods'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Warning extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.dangerSubtle,
        border: const Border.fromBorderSide(
          BorderSide(color: AppColors.danger, width: 1),
        ),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          const Icon(Icons.warning_amber_outlined,
              color: AppColors.danger, size: 16),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              "These can't be shown again. Store them somewhere safe.",
              style: GoogleFonts.inter(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: AppColors.danger,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _CodeGrid extends StatelessWidget {
  const _CodeGrid({required this.codes});
  final List<String> codes;

  @override
  Widget build(BuildContext context) {
    final rows = <Widget>[];
    for (int i = 0; i < codes.length; i += 2) {
      rows.add(
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 4),
          child: Row(
            children: [
              Expanded(child: _Code(text: codes[i])),
              const SizedBox(width: 12),
              if (i + 1 < codes.length)
                Expanded(child: _Code(text: codes[i + 1]))
              else
                const Spacer(),
            ],
          ),
        ),
      );
    }
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.surface,
        border: const Border.fromBorderSide(
          BorderSide(color: AppColors.border, width: 1),
        ),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(children: rows),
    );
  }
}

class _Code extends StatelessWidget {
  const _Code({required this.text});
  final String text;

  @override
  Widget build(BuildContext context) {
    return SelectableText(
      text,
      style: GoogleFonts.jetBrainsMono(
        fontSize: 13,
        fontWeight: FontWeight.w600,
        color: AppColors.textPrimary,
      ),
    );
  }
}

class _OutlinedAction extends StatelessWidget {
  const _OutlinedAction({
    required this.icon,
    required this.label,
    required this.onTap,
  });
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.surface,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          height: 44,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: AppColors.border, width: 1),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, size: 14, color: AppColors.textPrimary),
              const SizedBox(width: 6),
              Text(
                label,
                style: GoogleFonts.inter(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: AppColors.textPrimary,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
