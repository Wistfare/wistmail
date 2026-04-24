import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../../core/widgets/wm_app_bar.dart';
import '../../../auth/domain/mfa.dart';
import '../../../auth/presentation/providers/auth_controller.dart';

/// Mobile/MfaMethodsSettings — design.lib.pen `gTeAc`. Lists active
/// methods + backup-code remaining count + add/remove + danger zone.
class MfaMethodsSettingsScreen extends ConsumerStatefulWidget {
  const MfaMethodsSettingsScreen({super.key});

  @override
  ConsumerState<MfaMethodsSettingsScreen> createState() =>
      _MfaMethodsSettingsScreenState();
}

class _MfaMethodsSettingsScreenState
    extends ConsumerState<MfaMethodsSettingsScreen> {
  Future<MfaMethodsListing>? _future;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<MfaMethodsListing> _load() async {
    final repo = await ref.read(authRepositoryProvider.future);
    return repo.listMfaMethods();
  }

  void _refresh() {
    setState(() => _future = _load());
  }

  Future<void> _delete(String id) async {
    try {
      final repo = await ref.read(authRepositoryProvider.future);
      await repo.deleteMfaMethod(id);
      await ref.read(authControllerProvider.notifier).refreshUser();
      _refresh();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(_format(e))),
      );
    }
  }

  String _format(Object e) {
    final m = RegExp(r'ApiException\([^)]*\):\s*(.*)$').firstMatch(e.toString());
    return m != null ? m.group(1)! : 'Could not remove method.';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: const WmAppBar(title: 'Two-factor auth'),
      body: SafeArea(
        child: FutureBuilder<MfaMethodsListing>(
          future: _future,
          builder: (context, snapshot) {
            if (snapshot.connectionState == ConnectionState.waiting) {
              return const Center(
                child: SizedBox(
                  width: 22,
                  height: 22,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: AppColors.accent,
                  ),
                ),
              );
            }
            final data = snapshot.data;
            if (snapshot.hasError || data == null) {
              return Center(
                child: Padding(
                  padding: const EdgeInsets.all(32),
                  child: Text(
                    snapshot.error?.toString() ?? 'Could not load.',
                    style: AppTextStyles.bodySmall,
                  ),
                ),
              );
            }
            final hasAny = data.methods.any((m) => m.verified);
            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _StatusBanner(enabled: hasAny),
                const SizedBox(height: 20),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  child: Text('YOUR METHODS',
                      style: GoogleFonts.jetBrainsMono(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        color: AppColors.textTertiary,
                        letterSpacing: 1.2,
                      )),
                ),
                const SizedBox(height: 8),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  child: Column(
                    children: [
                      for (final m in data.methods.where((m) => m.verified))
                        _MethodRow(method: m, onDelete: () => _delete(m.id)),
                      if (data.hasBackupCodes)
                        _BackupCodesRow(
                          remaining: data.backupRemaining,
                          total: data.backupTotal,
                        ),
                      if (data.methods.where((m) => m.verified).isEmpty &&
                          !data.hasBackupCodes)
                        Padding(
                          padding: const EdgeInsets.symmetric(vertical: 16),
                          child: Text(
                            'No methods enabled yet.',
                            style: AppTextStyles.bodySmall,
                          ),
                        ),
                    ],
                  ),
                ),
                _AddMethodTile(
                  onTap: () async {
                    await context.push('/auth/mfa/setup');
                    _refresh();
                  },
                ),
                const Spacer(),
                if (hasAny)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Text('DANGER ZONE',
                            style: GoogleFonts.jetBrainsMono(
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                              color: AppColors.textTertiary,
                              letterSpacing: 1.2,
                            )),
                        const SizedBox(height: 10),
                        Material(
                          color: AppColors.surface,
                          child: InkWell(
                            onTap: () => _showDisableConfirm(context, data),
                            child: Container(
                              height: 48,
                              decoration: const BoxDecoration(
                                border: Border.fromBorderSide(
                                  BorderSide(
                                      color: AppColors.danger, width: 1),
                                ),
                              ),
                              alignment: Alignment.center,
                              child: Text(
                                'Disable two-factor',
                                style: GoogleFonts.inter(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w600,
                                  color: AppColors.danger,
                                ),
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
              ],
            );
          },
        ),
      ),
    );
  }

  Future<void> _showDisableConfirm(
    BuildContext context,
    MfaMethodsListing data,
  ) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Disable two-factor?'),
        content: const Text(
          'This removes every MFA method. Anyone with your password '
          'will be able to sign in. You can re-enable later from this screen.',
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Keep enabled')),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Disable',
                style: TextStyle(color: AppColors.danger)),
          ),
        ],
      ),
    );
    if (ok != true) return;
    for (final m in data.methods) {
      await _delete(m.id);
    }
  }
}

class _StatusBanner extends StatelessWidget {
  const _StatusBanner({required this.enabled});
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
      color: enabled ? AppColors.accentDim : AppColors.dangerSubtle,
      child: Row(
        children: [
          Icon(
            enabled ? Icons.shield_outlined : Icons.shield_outlined,
            size: 18,
            color: enabled ? AppColors.accent : AppColors.danger,
          ),
          const SizedBox(width: 10),
          Text(
            enabled ? 'Enabled' : 'Not enabled',
            style: GoogleFonts.inter(
              fontSize: 14,
              fontWeight: FontWeight.w600,
              color: enabled ? AppColors.accent : AppColors.danger,
            ),
          ),
        ],
      ),
    );
  }
}

class _MethodRow extends StatelessWidget {
  const _MethodRow({required this.method, required this.onDelete});
  final MfaMethodDetail method;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final isTotp = method.type == 'totp';
    final iconBg = isTotp ? AppColors.accentDim : AppColors.surface;
    final iconColor = isTotp ? AppColors.accent : AppColors.textSecondary;
    final icon = isTotp ? Icons.smartphone : Icons.mail_outline;
    final title = isTotp ? 'Authenticator app' : 'Backup email';
    final subtitle = isTotp
        ? (method.lastUsedAt == null
            ? 'Active'
            : 'Active · last used ${_relative(method.lastUsedAt!)}')
        : (method.label ?? 'Configured');

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onDelete,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 14),
          child: Row(
            children: [
              Container(
                width: 36,
                height: 36,
                color: iconBg,
                alignment: Alignment.center,
                child: Icon(icon, size: 18, color: iconColor),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title,
                        style: GoogleFonts.inter(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          color: AppColors.textPrimary,
                        )),
                    const SizedBox(height: 2),
                    Text(subtitle,
                        style: GoogleFonts.jetBrainsMono(
                          fontSize: 11,
                          color: AppColors.textSecondary,
                        )),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right,
                  size: 18, color: AppColors.textTertiary),
            ],
          ),
        ),
      ),
    );
  }

  String _relative(DateTime ts) {
    final d = DateTime.now().difference(ts);
    if (d.inMinutes < 1) return 'just now';
    if (d.inHours < 1) return '${d.inMinutes}m ago';
    if (d.inDays < 1) return '${d.inHours}h ago';
    if (d.inDays < 30) return '${d.inDays}d ago';
    return '${(d.inDays / 30).round()}mo ago';
  }
}

class _BackupCodesRow extends StatelessWidget {
  const _BackupCodesRow({required this.remaining, required this.total});
  final int remaining;
  final int total;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 14),
      child: Row(
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: const BoxDecoration(
              color: AppColors.surface,
              border: Border.fromBorderSide(
                BorderSide(color: AppColors.border, width: 1),
              ),
            ),
            alignment: Alignment.center,
            child: const Icon(Icons.vpn_key_outlined,
                size: 18, color: AppColors.textSecondary),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Backup codes',
                    style: GoogleFonts.inter(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: AppColors.textPrimary,
                    )),
                const SizedBox(height: 2),
                Text('$remaining of $total remaining',
                    style: GoogleFonts.jetBrainsMono(
                      fontSize: 11,
                      color: AppColors.textSecondary,
                    )),
              ],
            ),
          ),
          const Icon(Icons.chevron_right,
              size: 18, color: AppColors.textTertiary),
        ],
      ),
    );
  }
}

class _AddMethodTile extends StatelessWidget {
  const _AddMethodTile({required this.onTap});
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
          child: Row(
            children: [
              const Icon(Icons.add, color: AppColors.accent, size: 18),
              const SizedBox(width: 10),
              Text('Add a method',
                  style: GoogleFonts.inter(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: AppColors.accent,
                  )),
            ],
          ),
        ),
      ),
    );
  }
}
