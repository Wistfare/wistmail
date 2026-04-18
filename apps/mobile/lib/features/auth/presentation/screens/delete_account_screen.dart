import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../../../core/theme/app_colors.dart';
import '../providers/auth_controller.dart';

class DeleteAccountScreen extends ConsumerStatefulWidget {
  const DeleteAccountScreen({super.key});

  @override
  ConsumerState<DeleteAccountScreen> createState() => _DeleteAccountScreenState();
}

class _DeleteAccountScreenState extends ConsumerState<DeleteAccountScreen> {
  final _confirmController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _obscure = true;
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _confirmController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _delete() async {
    setState(() => _error = null);
    if (_confirmController.text.trim() != 'DELETE') {
      setState(() => _error = 'Type DELETE to confirm');
      return;
    }
    if (_passwordController.text.isEmpty) {
      setState(() => _error = 'Enter your password');
      return;
    }
    setState(() => _loading = true);

    final ok = await ref
        .read(authControllerProvider.notifier)
        .deleteAccount(password: _passwordController.text);
    if (!mounted) return;
    if (ok) {
      context.go('/auth/sign-in');
    } else {
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
      appBar: AppBar(
        backgroundColor: AppColors.background,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: AppColors.textPrimary),
          onPressed: () => context.pop(),
        ),
        title: Text(
          'Delete Account',
          style: GoogleFonts.inter(
            fontSize: 18,
            fontWeight: FontWeight.w600,
            color: AppColors.textPrimary,
          ),
        ),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _WarningBanner(),
            const SizedBox(height: 20),
            Text(
              'YOU WILL LOSE',
              style: GoogleFonts.inter(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: AppColors.textSecondary,
                letterSpacing: 0.8,
              ),
            ),
            const SizedBox(height: 10),
            _LossItem(
              icon: Icons.mail_outline,
              title: 'All emails & attachments',
              subtitle: 'Inbox, sent, drafts, and trash',
            ),
            _LossItem(
              icon: Icons.chat_bubble_outline,
              title: 'Chat history',
              subtitle: 'Every conversation you\'re part of',
            ),
            _LossItem(
              icon: Icons.calendar_today_outlined,
              title: 'Calendar & meetings',
              subtitle: 'All events you own',
            ),
            _LossItem(
              icon: Icons.folder_outlined,
              title: 'Projects & tasks',
              subtitle: 'Any projects you created',
            ),
            const SizedBox(height: 24),
            Text(
              'Type "DELETE" to confirm',
              style: GoogleFonts.inter(fontSize: 13, color: AppColors.textSecondary),
            ),
            const SizedBox(height: 8),
            TextField(
              key: const Key('delete-confirm'),
              controller: _confirmController,
              textCapitalization: TextCapitalization.characters,
              style: GoogleFonts.inter(fontSize: 14, color: AppColors.textPrimary),
              decoration: const InputDecoration(hintText: 'DELETE'),
            ),
            const SizedBox(height: 16),
            Text(
              'Your password',
              style: GoogleFonts.inter(fontSize: 13, color: AppColors.textSecondary),
            ),
            const SizedBox(height: 8),
            TextField(
              key: const Key('delete-password'),
              controller: _passwordController,
              obscureText: _obscure,
              style: GoogleFonts.inter(fontSize: 14, color: AppColors.textPrimary),
              decoration: InputDecoration(
                hintText: '••••••••',
                suffixIcon: IconButton(
                  icon: Icon(
                    _obscure ? Icons.visibility_off_outlined : Icons.visibility_outlined,
                    size: 18,
                    color: AppColors.textTertiary,
                  ),
                  onPressed: () => setState(() => _obscure = !_obscure),
                ),
              ),
            ),
            if (_error != null) ...[
              const SizedBox(height: 12),
              Text(
                _error!,
                style: GoogleFonts.inter(fontSize: 13, color: AppColors.badgeRed),
              ),
            ],
            const SizedBox(height: 20),
            ElevatedButton.icon(
              key: const Key('delete-submit'),
              onPressed: _loading ? null : _delete,
              icon: const Icon(Icons.delete_outline),
              label: Text(
                _loading ? 'Deleting…' : 'Permanently Delete Account',
                style: GoogleFonts.inter(fontSize: 15, fontWeight: FontWeight.w600),
              ),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.badgeRed,
                foregroundColor: Colors.white,
                elevation: 0,
                minimumSize: const Size(double.infinity, 48),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _WarningBanner extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.badgeRed.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.badgeRed.withValues(alpha: 0.3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.warning_amber_rounded, color: AppColors.badgeRed, size: 18),
              const SizedBox(width: 8),
              Text(
                'This action is permanent',
                style: GoogleFonts.inter(
                  fontSize: 15,
                  fontWeight: FontWeight.w700,
                  color: AppColors.badgeRed,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            'Deleting your account will permanently remove all your data, including emails, contacts, calendar events, chat history, and project files. This cannot be undone.',
            style: GoogleFonts.inter(
              fontSize: 13,
              color: AppColors.textPrimary,
              height: 1.45,
            ),
          ),
        ],
      ),
    );
  }
}

class _LossItem extends StatelessWidget {
  const _LossItem({required this.icon, required this.title, required this.subtitle});
  final IconData icon;
  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        children: [
          Icon(icon, color: AppColors.textSecondary, size: 20),
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
                Text(
                  subtitle,
                  style: GoogleFonts.inter(
                    fontSize: 12,
                    color: AppColors.textSecondary,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
