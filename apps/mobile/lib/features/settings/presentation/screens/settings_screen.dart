import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../auth/presentation/providers/auth_controller.dart';
import '../../../me/presentation/providers/me_providers.dart';

/// MobileV3 Settings — matches `design.lib.pen` node `s1bTp`.
///
/// Layout:
///   iTop (padding [8,20]): back btn 40×40 wm-surface circle + title
///     "SETTINGS" 11/700 mono letterSpacing 1.5 + search btn 40×40.
///   iBody (padding [16,20,0,20], gap 18 between sections):
///     Section blocks — each is an eyebrow (10/700 mono ls 1.5 secondary) +
///     a cornerRadius-14 wm-surface card holding rows.
///     Row: padding [12,14], gap 10. Left label 76w 10/700 mono ls 1.
///     Right value 13/normal primary (optional chevron or accent pill).
///     Divider 1px wm-border between rows.
///   statusNote: accent-dim pill with info icon + version.
///   ctaWrap (padding [12,20,24,20]): LOG OUT button 54h cornerRadius 27
///     wm-surface with #FF6B6B icon + text 13/700 letterSpacing 1.5.
class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authControllerProvider).user;
    final accounts = ref.watch(meConnectedAccountsProvider);

    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: Column(
          children: [
            _Header(onBack: () => Navigator.of(context).maybePop()),
            Expanded(
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
                children: [
                  _Section(
                    eyebrow: 'ACCOUNT',
                    children: [
                      _Row(
                        label: 'PROFILE',
                        value: _readField(user, 'name') ?? 'You',
                      ),
                      const _Divider(),
                      _Row(
                        label: 'EMAIL',
                        value: _readField(user, 'email') ?? '',
                        trailing: const _Chevron(),
                      ),
                    ],
                  ),
                  const SizedBox(height: 18),
                  _Section(
                    eyebrow: 'MAIL',
                    children: [
                      _Row(
                        label: 'ACCOUNTS',
                        value: accounts.valueOrNull == null
                            ? '—'
                            : '${accounts.valueOrNull!.length} accounts connected',
                      ),
                      const _Divider(),
                      _Row(
                        label: 'SIGNATURE',
                        value: 'Manage signatures',
                        trailing: const _AccentPill(label: 'OFF'),
                        onTap: () => context.push('/settings/signatures'),
                      ),
                    ],
                  ),
                  const SizedBox(height: 18),
                  _Section(
                    eyebrow: 'PREFERENCES',
                    children: const [
                      _Row(label: 'THEME', value: 'Dark · Auto'),
                      _Divider(),
                      _Row(label: 'LANGUAGE', value: 'English (US)'),
                    ],
                  ),
                  const SizedBox(height: 18),
                  _Section(
                    eyebrow: 'NOTIFICATIONS',
                    children: const [
                      _Row(
                        label: null,
                        value: 'Push alerts, daily digest, mention sounds, and more.',
                        multiline: true,
                      ),
                    ],
                  ),
                  const SizedBox(height: 18),
                  const _VersionNote(label: 'WistMail v3.0.1'),
                  const SizedBox(height: 24),
                ],
              ),
            ),
            _LogoutButton(
              onTap: () async {
                await ref.read(authControllerProvider.notifier).logout();
                if (context.mounted) context.go('/auth/sign-in');
              },
            ),
          ],
        ),
      ),
    );
  }

  static String? _readField(Object? obj, String field) {
    if (obj == null) return null;
    try {
      switch (field) {
        case 'name':
          return (obj as dynamic).name as String?;
        case 'email':
          return (obj as dynamic).email as String?;
      }
    } catch (_) {}
    return null;
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.onBack});
  final VoidCallback onBack;
  @override
  Widget build(BuildContext context) {
    // Pen `ktCss`: padding [8,20], space_between.
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
      child: Row(
        children: [
          _CircleBtn(icon: LucideIcons.arrowLeft, onTap: onBack),
          Expanded(
            child: Center(
              child: Text(
                'SETTINGS',
                style: GoogleFonts.jetBrainsMono(
                  color: AppColors.textPrimary,
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 1.5,
                ),
              ),
            ),
          ),
          _CircleBtn(icon: LucideIcons.search, onTap: () {}),
        ],
      ),
    );
  }
}

class _CircleBtn extends StatelessWidget {
  const _CircleBtn({required this.icon, required this.onTap});
  final IconData icon;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      customBorder: const CircleBorder(),
      child: Container(
        width: 40,
        height: 40,
        decoration: const BoxDecoration(
          color: AppColors.surface,
          shape: BoxShape.circle,
        ),
        alignment: Alignment.center,
        child: Icon(icon, size: 18, color: AppColors.textPrimary),
      ),
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.eyebrow, required this.children});
  final String eyebrow;
  final List<Widget> children;
  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          eyebrow,
          style: GoogleFonts.jetBrainsMono(
            color: AppColors.textSecondary,
            fontSize: 10,
            fontWeight: FontWeight.w700,
            letterSpacing: 1.5,
          ),
        ),
        const SizedBox(height: 10),
        Container(
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(14),
          ),
          child: Column(children: children),
        ),
      ],
    );
  }
}

class _Divider extends StatelessWidget {
  const _Divider();
  @override
  Widget build(BuildContext context) {
    return Container(height: 1, color: AppColors.border);
  }
}

class _Row extends StatelessWidget {
  const _Row({
    required this.label,
    required this.value,
    this.trailing,
    this.onTap,
    this.multiline = false,
  });
  final String? label;
  final String value;
  final Widget? trailing;
  final VoidCallback? onTap;
  final bool multiline;

  @override
  Widget build(BuildContext context) {
    // Pen row (f1/f2/g1/g2/h1/h2): padding [12,14], gap 10.
    final row = Row(
      crossAxisAlignment: multiline
          ? CrossAxisAlignment.start
          : CrossAxisAlignment.center,
      children: [
        if (label != null) ...[
          SizedBox(
            width: 76,
            child: Text(
              label!,
              style: GoogleFonts.jetBrainsMono(
                color: AppColors.textSecondary,
                fontSize: 10,
                fontWeight: FontWeight.w700,
                letterSpacing: 1,
              ),
            ),
          ),
          const SizedBox(width: 10),
        ],
        Expanded(
          child: Text(
            value,
            maxLines: multiline ? 4 : 1,
            overflow: multiline ? TextOverflow.visible : TextOverflow.ellipsis,
            style: GoogleFonts.jetBrainsMono(
              color: multiline ? AppColors.textSecondary : AppColors.textPrimary,
              fontSize: 13,
              height: multiline ? 1.5 : null,
            ),
          ),
        ),
        if (trailing != null) ...[
          const SizedBox(width: 8),
          trailing!,
        ],
      ],
    );
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        child: row,
      ),
    );
  }
}

class _Chevron extends StatelessWidget {
  const _Chevron();
  @override
  Widget build(BuildContext context) {
    return const Icon(LucideIcons.chevronRight,
        size: 14, color: AppColors.textSecondary);
  }
}

class _AccentPill extends StatelessWidget {
  const _AccentPill({required this.label});
  final String label;
  @override
  Widget build(BuildContext context) {
    // Pen pill1: cornerRadius 6, padding [3,8], fill accent-dim, text
    // 9/700 accent letterSpacing 1.
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: AppColors.accentDim,
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(
        label,
        style: GoogleFonts.jetBrainsMono(
          color: AppColors.accent,
          fontSize: 9,
          fontWeight: FontWeight.w700,
          letterSpacing: 1,
        ),
      ),
    );
  }
}

class _VersionNote extends StatelessWidget {
  const _VersionNote({required this.label});
  final String label;
  @override
  Widget build(BuildContext context) {
    // Pen `tykJn`: cornerRadius 12, padding [12,14], fill accent-dim,
    // gap 8, alignItems center.
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: AppColors.accentDim,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          const Icon(LucideIcons.info, size: 14, color: AppColors.accent),
          const SizedBox(width: 8),
          Text(
            label,
            style: GoogleFonts.jetBrainsMono(
              color: AppColors.accent,
              fontSize: 12,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

class _LogoutButton extends StatelessWidget {
  const _LogoutButton({required this.onTap});
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    // Pen `ORyyq`: cornerRadius 27, fill wm-surface, gap 8, height 54.
    // Text "LOG OUT" 13/700 mono letterSpacing 1.5 color #FF6B6B.
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(27),
        child: Container(
          height: 54,
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(27),
          ),
          alignment: Alignment.center,
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(LucideIcons.logOut,
                  size: 16, color: Color(0xFFFF6B6B)),
              const SizedBox(width: 8),
              Text(
                'LOG OUT',
                style: GoogleFonts.jetBrainsMono(
                  color: const Color(0xFFFF6B6B),
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 1.5,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
