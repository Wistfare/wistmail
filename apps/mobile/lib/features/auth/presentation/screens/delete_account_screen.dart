import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../../core/widgets/wm_app_bar.dart';
import '../../../../core/widgets/wm_primary_button.dart';
import '../providers/auth_controller.dart';

/// Mobile/DeleteAccount — design.lib.pen node `zHUPO`.
class DeleteAccountScreen extends ConsumerStatefulWidget {
  const DeleteAccountScreen({super.key});

  @override
  ConsumerState<DeleteAccountScreen> createState() =>
      _DeleteAccountScreenState();
}

class _DeleteAccountScreenState extends ConsumerState<DeleteAccountScreen> {
  final _confirmController = TextEditingController();
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _confirmController.dispose();
    super.dispose();
  }

  Future<void> _delete() async {
    setState(() => _error = null);
    if (_confirmController.text.trim() != 'DELETE') {
      setState(() => _error = 'Type DELETE to confirm');
      return;
    }
    setState(() => _loading = true);

    final ok = await ref
        .read(authControllerProvider.notifier)
        .deleteAccount(password: '');
    if (!mounted) return;
    // On success, the auth state flips to logged-out and the router
    // redirects to /auth/sign-in automatically.
    if (!ok) {
      final err = ref.read(authControllerProvider).errorMessage ??
          'Could not delete account.';
      setState(() {
        _loading = false;
        _error = err;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: const WmAppBar(title: 'Delete Account', divider: false),
      body: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 4, 20, 24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const _WarningBanner(),
            const SizedBox(height: 24),
            Text('YOU WILL LOSE', style: AppTextStyles.sectionLabel),
            const SizedBox(height: 12),
            const _LossItem(
              icon: Icons.mail_outline,
              title: 'All emails & attachments',
              subtitle: '47 conversations, 12 drafts',
            ),
            const _LossItem(
              icon: Icons.chat_bubble_outline,
              title: 'Chat history',
              subtitle: '5 conversations',
            ),
            const _LossItem(
              icon: Icons.calendar_today_outlined,
              title: 'Calendar & meetings',
              subtitle: '3 upcoming events',
            ),
            const _LossItem(
              icon: Icons.folder_outlined,
              title: 'Projects & tasks',
              subtitle: '2 active projects',
            ),
            const SizedBox(height: 24),
            Text(
              'Type "DELETE" to confirm',
              style: AppTextStyles.bodySmall,
            ),
            const SizedBox(height: 10),
            Container(
              decoration: const BoxDecoration(
                color: AppColors.surface,
                border: Border.fromBorderSide(
                  BorderSide(color: AppColors.border),
                ),
              ),
              child: TextField(
                key: const Key('delete-confirm'),
                controller: _confirmController,
                textCapitalization: TextCapitalization.characters,
                cursorColor: AppColors.accent,
                style: GoogleFonts.jetBrainsMono(
                  fontSize: 14,
                  color: AppColors.textPrimary,
                ),
                decoration: const InputDecoration(
                  hintText: 'DELETE',
                  isCollapsed: true,
                  border: InputBorder.none,
                  enabledBorder: InputBorder.none,
                  focusedBorder: InputBorder.none,
                  contentPadding: EdgeInsets.symmetric(
                    horizontal: 14,
                    vertical: 14,
                  ),
                ),
              ),
            ),
            if (_error != null) ...[
              const SizedBox(height: 12),
              Text(
                _error!,
                style: AppTextStyles.bodySmall.copyWith(color: AppColors.danger),
              ),
            ],
            const SizedBox(height: 20),
            WmDangerButton(
              key: const Key('delete-submit'),
              label: 'Permanently Delete Account',
              icon: Icons.delete_outline,
              onPressed: _loading ? null : _delete,
            ),
            const SizedBox(height: 12),
            Text(
              'You have 30 days to recover your account after deletion by contacting support.',
              textAlign: TextAlign.center,
              style: AppTextStyles.bodySmall.copyWith(
                color: AppColors.textTertiary,
                fontSize: 12,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _WarningBanner extends StatelessWidget {
  const _WarningBanner();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: const BoxDecoration(
        color: AppColors.dangerSubtle,
        border: Border.fromBorderSide(
          BorderSide(color: AppColors.danger, width: 1),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.warning_amber_rounded,
                  color: AppColors.danger, size: 18),
              const SizedBox(width: 8),
              Text(
                'This action is permanent',
                style: GoogleFonts.inter(
                  fontSize: 15,
                  fontWeight: FontWeight.w700,
                  color: AppColors.danger,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            'Deleting your account will permanently remove all your data, including emails, contacts, calendar events, chat history, and project files. This cannot be undone.',
            style: GoogleFonts.inter(
              fontSize: 13,
              color: AppColors.textSecondary,
              height: 1.5,
            ),
          ),
        ],
      ),
    );
  }
}

class _LossItem extends StatelessWidget {
  const _LossItem({
    required this.icon,
    required this.title,
    required this.subtitle,
  });
  final IconData icon;
  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 1),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      decoration: const BoxDecoration(
        color: AppColors.surface,
      ),
      child: Row(
        children: [
          Icon(icon, color: AppColors.textSecondary, size: 18),
          const SizedBox(width: 14),
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
                const SizedBox(height: 2),
                Text(
                  subtitle,
                  style: AppTextStyles.monoSmall.copyWith(fontSize: 11),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
