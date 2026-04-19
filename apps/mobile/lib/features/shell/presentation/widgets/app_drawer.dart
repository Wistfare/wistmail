import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../../core/widgets/wm_avatar.dart';
import '../../../../core/widgets/wm_logo.dart';
import '../../../auth/presentation/providers/auth_controller.dart';

/// Mobile/Drawer — design.lib.pen node `poQbm`. 300px wide, sharp corners.
class AppDrawer extends ConsumerWidget {
  const AppDrawer({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authControllerProvider).user;
    final route = GoRouterState.of(context).uri.path;

    return Drawer(
      backgroundColor: AppColors.drawerBackground,
      width: 300,
      shape: const RoundedRectangleBorder(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _Header(),
          _UserTile(
            name: user?.name ?? 'Signed out',
            email: user?.email ?? '',
            onClose: () => Navigator.of(context).pop(),
          ),
          const SizedBox(height: 8),
          const Divider(color: AppColors.border, height: 1),
          const SizedBox(height: 12),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: Text('FOLDERS', style: AppTextStyles.sectionLabel),
          ),
          const SizedBox(height: 4),
          _FolderItem(
            icon: Icons.inbox_outlined,
            label: 'Inbox',
            isActive: route.startsWith('/inbox'),
            badge: 12,
          ),
          const _FolderItem(icon: Icons.star_outline, label: 'Starred'),
          const _FolderItem(icon: Icons.send_outlined, label: 'Sent'),
          const _FolderItem(icon: Icons.edit_outlined, label: 'Drafts', badge: 4),
          const _FolderItem(icon: Icons.delete_outline, label: 'Trash'),
          const _FolderItem(icon: Icons.shield_outlined, label: 'Spam'),
          const SizedBox(height: 16),
          const Divider(color: AppColors.border, height: 1),
          const SizedBox(height: 12),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: Text('LABELS', style: AppTextStyles.sectionLabel),
          ),
          const SizedBox(height: 4),
          const _LabelItem(color: AppColors.labelYellow, label: 'Priority'),
          const _LabelItem(color: AppColors.labelBlue, label: 'Work'),
          const _LabelItem(color: AppColors.labelOrange, label: 'Newsletters'),
          const SizedBox(height: 6),
          _CreateLabelButton(onTap: () {}),
          const Spacer(),
          const Divider(color: AppColors.border, height: 1),
          _BottomAction(
            icon: Icons.shield_outlined,
            label: 'Two-factor auth',
            color: AppColors.textPrimary,
            onTap: () {
              Navigator.of(context).pop();
              context.push('/auth/mfa/methods');
            },
          ),
          _BottomAction(
            icon: Icons.logout,
            label: 'Sign out',
            color: AppColors.textPrimary,
            onTap: () async {
              await ref.read(authControllerProvider.notifier).logout();
              if (context.mounted) context.go('/auth/sign-in');
            },
          ),
          _BottomAction(
            icon: Icons.delete_outline,
            label: 'Delete account',
            color: AppColors.danger,
            onTap: () {
              Navigator.of(context).pop();
              context.push('/settings/delete-account');
            },
          ),
          const SizedBox(height: 8),
        ],
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header();

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      bottom: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 20, 16, 16),
        child: Row(
          children: [
            const WmLogo(size: 28),
            const SizedBox(width: 10),
            Text(
              'Wistfare Mail',
              style: GoogleFonts.inter(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: AppColors.textPrimary,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _UserTile extends StatelessWidget {
  const _UserTile({
    required this.name,
    required this.email,
    required this.onClose,
  });
  final String name;
  final String email;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 4, 16, 16),
      child: Row(
        children: [
          WmAvatar(name: name, size: 36, color: AppColors.accent),
          const SizedBox(width: 12),
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
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 2),
                Text(
                  email,
                  style: AppTextStyles.monoSmall,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
          IconButton(
            splashRadius: 18,
            onPressed: onClose,
            icon: const Icon(Icons.close, size: 18),
            color: AppColors.textTertiary,
          ),
        ],
      ),
    );
  }
}

class _FolderItem extends StatelessWidget {
  const _FolderItem({
    required this.icon,
    required this.label,
    this.isActive = false,
    this.badge,
  });
  final IconData icon;
  final String label;
  final bool isActive;
  final int? badge;

  @override
  Widget build(BuildContext context) {
    final fg = isActive ? AppColors.accent : AppColors.textPrimary;
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: () {},
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 11),
          color: isActive ? AppColors.accentDim : Colors.transparent,
          child: Row(
            children: [
              Icon(icon, size: 18, color: fg),
              const SizedBox(width: 14),
              Expanded(
                child: Text(
                  label,
                  style: GoogleFonts.inter(
                    fontSize: 14,
                    fontWeight: isActive ? FontWeight.w600 : FontWeight.w400,
                    color: fg,
                  ),
                ),
              ),
              if (badge != null)
                Text(
                  '$badge',
                  style: AppTextStyles.monoSmall.copyWith(
                    color: isActive ? AppColors.accent : AppColors.textTertiary,
                  ),
                ),
            ],
          ),
        ),
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
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: () {},
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 9),
          child: Row(
            children: [
              Container(width: 10, height: 10, color: color),
              const SizedBox(width: 14),
              Text(
                label,
                style: GoogleFonts.inter(
                  fontSize: 13,
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

class _CreateLabelButton extends StatelessWidget {
  const _CreateLabelButton({required this.onTap});
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 9),
          child: Row(
            children: [
              const Icon(Icons.add, size: 14, color: AppColors.accent),
              const SizedBox(width: 10),
              Text(
                'Create Label',
                style: GoogleFonts.inter(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: AppColors.accent,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _BottomAction extends StatelessWidget {
  const _BottomAction({
    required this.icon,
    required this.label,
    required this.color,
    required this.onTap,
  });
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 13),
          child: Row(
            children: [
              Icon(icon, size: 18, color: color),
              const SizedBox(width: 14),
              Text(
                label,
                style: GoogleFonts.inter(fontSize: 14, color: color),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
