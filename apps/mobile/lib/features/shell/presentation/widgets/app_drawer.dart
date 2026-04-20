import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../../core/widgets/wm_avatar.dart';
import '../../../auth/presentation/providers/auth_controller.dart';
import '../../../labels/presentation/providers/labels_providers.dart';
import '../../../mail/presentation/providers/mail_providers.dart';

/// Mobile/Drawer — design.lib.pen node `poQbm`. Matches the design
/// exactly: 300px panel, header + user tile + folders + labels. Account
/// actions (sign out, two-factor, delete) are reachable via tapping the
/// user tile, which opens an account sheet instead of cluttering the
/// drawer chrome.
class AppDrawer extends ConsumerWidget {
  const AppDrawer({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authControllerProvider).user;
    final activeFolder = ref.watch(currentFolderProvider);

    void selectFolder(InboxFolder folder) {
      // Update state first so the inbox starts loading the new view
      // before we even close the drawer — user feels the transition.
      ref.read(currentFolderProvider.notifier).state = folder;
      Navigator.of(context).pop();
      // If we somehow ended up on a non-inbox screen, jump back so the
      // freshly-selected folder is actually visible.
      final currentRoute = GoRouterState.of(context).uri.path;
      if (!currentRoute.startsWith('/inbox')) {
        context.go('/inbox');
      }
    }

    return Drawer(
      backgroundColor: AppColors.drawerBackground,
      width: 300,
      shape: const RoundedRectangleBorder(),
      child: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const _Header(),
            _UserTile(
              name: user?.name ?? 'Signed out',
              email: user?.email ?? '',
              onTap: () => _openAccountSheet(context, ref),
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
            for (final entry in _folderEntries)
              _FolderItem(
                icon: entry.icon,
                label: entry.folder.label,
                isActive: activeFolder.id == entry.folder.id,
                onTap: () => selectFolder(entry.folder),
              ),
            const SizedBox(height: 16),
            const Divider(color: AppColors.border, height: 1),
            const SizedBox(height: 12),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: Text('LABELS', style: AppTextStyles.sectionLabel),
            ),
            const SizedBox(height: 4),
            // Real labels from the API. AsyncValue.when keeps the drawer
            // snappy during first paint (we show the previous cached
            // list if we have one, otherwise an empty gap the user can
            // scroll past to hit "Manage labels").
            Consumer(builder: (context, ref, _) {
              final labelsAsync = ref.watch(labelsListProvider);
              return labelsAsync.maybeWhen(
                data: (labels) => Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (labels.isEmpty)
                      Padding(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 20,
                          vertical: 4,
                        ),
                        child: Text(
                          'No labels yet',
                          style: GoogleFonts.jetBrainsMono(
                            fontSize: 10,
                            color: AppColors.textMuted,
                          ),
                        ),
                      )
                    else
                      for (final l in labels)
                        _LabelItem(color: l.swatch, label: l.name),
                  ],
                ),
                orElse: () => const SizedBox.shrink(),
              );
            }),
            const SizedBox(height: 6),
            _CreateLabelButton(onTap: () {
              Navigator.of(context).pop();
              context.push('/settings/labels');
            }),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }

  Future<void> _openAccountSheet(BuildContext context, WidgetRef ref) async {
    // Close the drawer first so the sheet animates over the underlying
    // tab — much cleaner than stacking two surfaces on top of each other.
    Navigator.of(context).pop();
    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: AppColors.surface,
      barrierColor: AppColors.drawerOverlay,
      isScrollControlled: false,
      shape: const RoundedRectangleBorder(),
      builder: (sheetCtx) => _AccountSheet(
        onSignOut: () async {
          Navigator.of(sheetCtx).pop();
          await ref.read(authControllerProvider.notifier).logout();
          if (context.mounted) context.go('/auth/sign-in');
        },
        onTwoFactor: () {
          Navigator.of(sheetCtx).pop();
          context.push('/auth/mfa/methods');
        },
        onManageLabels: () {
          Navigator.of(sheetCtx).pop();
          context.push('/settings/labels');
        },
        onDeleteAccount: () {
          Navigator.of(sheetCtx).pop();
          context.push('/settings/delete-account');
        },
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
        child: Container(),
      ),
    );
  }
}

class _UserTile extends StatelessWidget {
  const _UserTile({
    required this.name,
    required this.email,
    required this.onTap,
    required this.onClose,
  });
  final String name;
  final String email;
  final VoidCallback onTap;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        child: Padding(
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
            ],
          ),
        ),
      ),
    );
  }
}

/// Static (icon, folder) tuples driving the drawer's folder list.
/// Order matches the design and the web sidebar so muscle memory
/// transfers between platforms.
class _FolderEntry {
  const _FolderEntry(this.icon, this.folder);
  final IconData icon;
  final InboxFolder folder;
}

const List<_FolderEntry> _folderEntries = [
  _FolderEntry(Icons.inbox_outlined, InboxFolder.inbox),
  _FolderEntry(Icons.star_outline, InboxFolder.starred),
  _FolderEntry(Icons.access_time, InboxFolder.snoozed),
  _FolderEntry(Icons.send_outlined, InboxFolder.sent),
  _FolderEntry(Icons.edit_outlined, InboxFolder.drafts),
  _FolderEntry(Icons.schedule_send_outlined, InboxFolder.scheduled),
  _FolderEntry(Icons.archive_outlined, InboxFolder.archive),
  _FolderEntry(Icons.delete_outline, InboxFolder.trash),
  _FolderEntry(Icons.shield_outlined, InboxFolder.spam),
  _FolderEntry(Icons.all_inbox_outlined, InboxFolder.all),
];

class _FolderItem extends StatelessWidget {
  const _FolderItem({
    required this.icon,
    required this.label,
    required this.onTap,
    this.isActive = false,
  });
  final IconData icon;
  final String label;
  final bool isActive;
  final VoidCallback onTap;
  // Per-folder unread badges will land in Phase F together with real
  // labels — the API still needs an unread-by-folder endpoint.

  @override
  Widget build(BuildContext context) {
    final fg = isActive ? AppColors.accent : AppColors.textPrimary;
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
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

/// Modal sheet shown when the user taps their tile in the drawer. Hosts
/// the account-level actions that used to clutter the bottom of the
/// drawer (sign out, two-factor, delete account).
class _AccountSheet extends StatelessWidget {
  const _AccountSheet({
    required this.onSignOut,
    required this.onTwoFactor,
    required this.onManageLabels,
    required this.onDeleteAccount,
  });
  final VoidCallback onSignOut;
  final VoidCallback onTwoFactor;
  final VoidCallback onManageLabels;
  final VoidCallback onDeleteAccount;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const SizedBox(height: 8),
          Container(width: 36, height: 4, color: AppColors.border),
          const SizedBox(height: 8),
          _SheetAction(
            icon: Icons.label_outline,
            label: 'Manage labels',
            onTap: onManageLabels,
          ),
          const Divider(color: AppColors.border, height: 1),
          _SheetAction(
            icon: Icons.shield_outlined,
            label: 'Two-factor authentication',
            onTap: onTwoFactor,
          ),
          const Divider(color: AppColors.border, height: 1),
          _SheetAction(
            icon: Icons.logout,
            label: 'Sign out',
            onTap: onSignOut,
          ),
          const Divider(color: AppColors.border, height: 1),
          _SheetAction(
            icon: Icons.delete_outline,
            label: 'Delete account',
            color: AppColors.danger,
            onTap: onDeleteAccount,
          ),
          const SizedBox(height: 8),
        ],
      ),
    );
  }
}

class _SheetAction extends StatelessWidget {
  const _SheetAction({
    required this.icon,
    required this.label,
    required this.onTap,
    this.color,
  });
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final fg = color ?? AppColors.textPrimary;
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
          child: Row(
            children: [
              Icon(icon, size: 18, color: fg),
              const SizedBox(width: 14),
              Text(
                label,
                style: GoogleFonts.inter(
                  fontSize: 14,
                  fontWeight: FontWeight.w500,
                  color: fg,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
