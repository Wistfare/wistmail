import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../auth/presentation/providers/auth_controller.dart';

class AppDrawer extends ConsumerWidget {
  const AppDrawer({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authControllerProvider).user;

    return Drawer(
      backgroundColor: AppColors.drawerBackground,
      child: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _DrawerHeader(),
            _UserTile(
              name: user?.name ?? 'Signed out',
              email: user?.email ?? '',
              initials: user?.initials ?? '?',
              onClose: () => Navigator.of(context).pop(),
            ),
            const SizedBox(height: 20),
            _SectionLabel('FOLDERS'),
            const SizedBox(height: 4),
            _FolderItem(icon: Icons.inbox_outlined, label: 'Inbox', isActive: true),
            _FolderItem(icon: Icons.star_outline, label: 'Starred'),
            _FolderItem(icon: Icons.send_outlined, label: 'Sent'),
            _FolderItem(icon: Icons.edit_outlined, label: 'Drafts'),
            _FolderItem(icon: Icons.delete_outline, label: 'Trash'),
            _FolderItem(icon: Icons.security_outlined, label: 'Spam'),
            const SizedBox(height: 20),
            _SectionLabel('LABELS'),
            const SizedBox(height: 4),
            _LabelItem(color: AppColors.labelDotPriority, label: 'Priority'),
            _LabelItem(color: AppColors.labelDotWork, label: 'Work'),
            _LabelItem(color: AppColors.labelDotNewsletters, label: 'Newsletters'),
            const SizedBox(height: 8),
            _CreateLabelButton(),
            const Spacer(),
            const Divider(color: AppColors.border, height: 1),
            ListTile(
              leading: const Icon(Icons.logout, color: AppColors.textSecondary, size: 20),
              title: Text(
                'Sign out',
                style: GoogleFonts.inter(
                  fontSize: 14,
                  color: AppColors.textPrimary,
                ),
              ),
              onTap: () async {
                await ref.read(authControllerProvider.notifier).logout();
                if (context.mounted) context.go('/auth/sign-in');
              },
            ),
            ListTile(
              leading: const Icon(Icons.delete_outline, color: AppColors.badgeRed, size: 20),
              title: Text(
                'Delete account',
                style: GoogleFonts.inter(
                  fontSize: 14,
                  color: AppColors.badgeRed,
                ),
              ),
              onTap: () {
                Navigator.of(context).pop();
                context.push('/settings/delete-account');
              },
            ),
          ],
        ),
      ),
    );
  }
}

class _DrawerHeader extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
      child: Row(
        children: [
          Container(
            width: 32,
            height: 32,
            decoration: BoxDecoration(
              color: AppColors.accent,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Center(
              child: Text(
                'W',
                style: GoogleFonts.inter(
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                  color: AppColors.background,
                ),
              ),
            ),
          ),
          const SizedBox(width: 10),
          Text(
            'Wistfare Mail',
            style: GoogleFonts.inter(
              fontSize: 15,
              fontWeight: FontWeight.w600,
              color: AppColors.textPrimary,
            ),
          ),
        ],
      ),
    );
  }
}

class _UserTile extends StatelessWidget {
  const _UserTile({
    required this.name,
    required this.email,
    required this.initials,
    required this.onClose,
  });

  final String name;
  final String email;
  final String initials;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        child: Row(
          children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: const Color(0xFF4A2D6A),
                borderRadius: BorderRadius.circular(18),
              ),
              child: Center(
                child: Text(
                  initials,
                  style: GoogleFonts.inter(
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                    color: Colors.white,
                  ),
                ),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    name,
                    style: GoogleFonts.inter(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: AppColors.textPrimary,
                    ),
                  ),
                  Text(
                    email,
                    style: GoogleFonts.inter(
                      fontSize: 12,
                      color: AppColors.textSecondary,
                    ),
                  ),
                ],
              ),
            ),
            GestureDetector(
              onTap: onClose,
              child: const Icon(Icons.close, color: AppColors.textSecondary, size: 18),
            ),
          ],
        ),
      ),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel(this.text);
  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24),
      child: Text(
        text,
        style: GoogleFonts.inter(
          fontSize: 11,
          fontWeight: FontWeight.w600,
          color: AppColors.textTertiary,
          letterSpacing: 0.8,
        ),
      ),
    );
  }
}

class _FolderItem extends StatelessWidget {
  const _FolderItem({
    required this.icon,
    required this.label,
    this.isActive = false,
  });

  final IconData icon;
  final String label;
  final bool isActive;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 8, vertical: 1),
      decoration: BoxDecoration(
        color: isActive ? AppColors.accent.withValues(alpha: 0.12) : Colors.transparent,
        borderRadius: BorderRadius.circular(8),
      ),
      child: ListTile(
        dense: true,
        leading: Icon(
          icon,
          size: 20,
          color: isActive ? AppColors.accent : AppColors.textSecondary,
        ),
        title: Text(
          label,
          style: GoogleFonts.inter(
            fontSize: 14,
            fontWeight: isActive ? FontWeight.w600 : FontWeight.normal,
            color: isActive ? AppColors.accent : AppColors.textPrimary,
          ),
        ),
        onTap: () {},
      ),
    );
  }
}

class _LabelItem extends StatelessWidget {
  const _LabelItem({required this.color, required this.label});
  final Color color;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 8),
      child: Row(
        children: [
          Container(
            width: 10,
            height: 10,
            decoration: BoxDecoration(color: color, shape: BoxShape.circle),
          ),
          const SizedBox(width: 12),
          Text(
            label,
            style: GoogleFonts.inter(
              fontSize: 14,
              color: AppColors.textPrimary,
            ),
          ),
        ],
      ),
    );
  }
}

class _CreateLabelButton extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 4),
      child: Row(
        children: [
          const Icon(Icons.add, size: 16, color: AppColors.textTertiary),
          const SizedBox(width: 10),
          Text(
            'Create Label',
            style: GoogleFonts.inter(
              fontSize: 14,
              color: AppColors.textTertiary,
            ),
          ),
        ],
      ),
    );
  }
}
