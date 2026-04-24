import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../auth/presentation/providers/auth_controller.dart';
import '../../domain/me_models.dart';
import '../providers/me_providers.dart';

/// MobileV3 Me — pen node `KnZAO`.
///
/// Header (mHdr, padding [8,16,16,16], gap 16):
///   mHTop space_between: "Me" 28/700 mono, gear btn 38×38 cornerRadius 19
///     wm-surface, settings icon 18 primary.
///   mProf card: wm-surface, cornerRadius 14, padding 16, gap 14 horizontal.
///     Avatar 60×60 cornerRadius 30 wm-accent, "V" 26/700 mono black.
///     Profile col gap 3: name 18/700 primary, email 12/normal secondary,
///     status row gap 6 (8×8 accent dot + "Focus · until HH:MM" 11/normal accent).
///
/// Stats (mStats, padding [0,16,16,16], gap 10):
///   3 cards each wm-surface, cornerRadius 14, padding 14, gap 4.
///     Label 9/600 secondary letterSpacing 1, value 22/700 primary.
///
/// Body (mList, padding [0,16], gap 10):
///   Eyebrow 10/700 secondary letterSpacing 1.5.
///   Card container (wm-surface, cornerRadius 14) holding rows with
///     1px wm-border dividers. Each row padding 14, gap 12:
///       icon badge 32×32 cornerRadius 8 (fill varies), icon 16 color varies.
///       col gap 2: title 14/700 primary + subtitle 11/normal secondary.
///       trailing: toggle (Focus) or chevron-right 16 secondary.
class MeScreen extends ConsumerWidget {
  const MeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authControllerProvider).user;
    final stats = ref.watch(meStatsProvider);
    final prefsAsync = ref.watch(mePreferencesControllerProvider);
    final accounts = ref.watch(meConnectedAccountsProvider);

    // Me is a pushed page (reached via Today header avatar). No bottom
    // navigation — the tab bar belongs to the primary shell.
    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: RefreshIndicator(
          color: AppColors.accent,
          backgroundColor: AppColors.surface,
          onRefresh: () async {
            ref.invalidate(meStatsProvider);
            ref.invalidate(meConnectedAccountsProvider);
            ref.invalidate(mePreferencesControllerProvider);
            await ref.read(meStatsProvider.future);
          },
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: EdgeInsets.zero,
            children: [
              _HeaderBlock(
                user: user,
                prefs: prefsAsync.valueOrNull,
                onBack: () => Navigator.of(context).maybePop(),
                onSettings: () => context.push('/settings'),
              ),
              _StatsBlock(stats: stats.valueOrNull ?? MeStats.empty),
              _PreferencesBlock(
                prefs: prefsAsync.valueOrNull ?? MePreferences.empty,
                accounts: accounts.valueOrNull ?? const [],
                onToggleFocus: () => ref
                    .read(mePreferencesControllerProvider.notifier)
                    .toggleFocusMode(until: const Duration(hours: 4)),
                onNotificationsTap: () =>
                    _openNotificationsSheet(context, ref),
                onConnectedTap: () {},
              ),
              const SizedBox(height: 10),
              const _QuickBlock(),
              const SizedBox(height: 32),
            ],
          ),
        ),
      ),
    );
  }

  void _openNotificationsSheet(BuildContext context, WidgetRef ref) {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: AppColors.surface,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius:
            BorderRadius.vertical(top: Radius.circular(14)),
      ),
      builder: (ctx) => Consumer(
        builder: (context, ref, _) {
          final prefs = ref
                  .watch(mePreferencesControllerProvider)
                  .valueOrNull
                  ?.notificationPrefs ??
              const MeNotificationPrefs();
          final controller =
              ref.read(mePreferencesControllerProvider.notifier);
          return Padding(
            padding: EdgeInsets.fromLTRB(
                16, 16, 16, MediaQuery.of(context).viewInsets.bottom + 24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  'Notifications',
                  style: GoogleFonts.jetBrainsMono(
                    color: AppColors.textPrimary,
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 12),
                _SheetSwitch(
                  label: 'Mail',
                  value: prefs.mail,
                  onChanged: (v) => controller.setNotificationPref(mail: v),
                ),
                _SheetSwitch(
                  label: 'Chat',
                  value: prefs.chat,
                  onChanged: (v) => controller.setNotificationPref(chat: v),
                ),
                _SheetSwitch(
                  label: 'Calendar',
                  value: prefs.calendar,
                  onChanged: (v) =>
                      controller.setNotificationPref(calendar: v),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _HeaderBlock extends StatelessWidget {
  const _HeaderBlock({
    required this.user,
    required this.prefs,
    required this.onBack,
    required this.onSettings,
  });
  // Accept Object? so this widget survives both User and null without
  // importing the auth domain type here. We read name/email reflectively.
  final Object? user;
  final MePreferences? prefs;
  final VoidCallback onBack;
  final VoidCallback onSettings;

  @override
  Widget build(BuildContext context) {
    final name = _readField(user, 'name') ?? 'You';
    final email = _readField(user, 'email') ?? '';
    final initial = name.trim().isEmpty ? 'Y' : name.trim()[0].toUpperCase();
    final focusUntil = prefs?.focusModeUntil;
    final focusOn = prefs?.focusModeEnabled == true;

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              // Back button — Me is pushed on top of the shell, so the
              // header carries its own dismiss control.
              _BackButton(onTap: onBack),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  'Me',
                  style: GoogleFonts.jetBrainsMono(
                    color: AppColors.textPrimary,
                    fontSize: 28,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              _GearButton(onTap: onSettings),
            ],
          ),
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: AppColors.surface,
              borderRadius: BorderRadius.circular(14),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                _BigAvatar(initial: initial),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        name,
                        style: GoogleFonts.jetBrainsMono(
                          color: AppColors.textPrimary,
                          fontSize: 18,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 3),
                      Text(
                        email,
                        style: GoogleFonts.jetBrainsMono(
                          color: AppColors.textSecondary,
                          fontSize: 12,
                        ),
                      ),
                      const SizedBox(height: 3),
                      Row(
                        children: [
                          Container(
                            width: 8,
                            height: 8,
                            decoration: BoxDecoration(
                              color: focusOn
                                  ? AppColors.accent
                                  : AppColors.textMuted,
                              shape: BoxShape.circle,
                            ),
                          ),
                          const SizedBox(width: 6),
                          Text(
                            focusOn
                                ? 'Focus${focusUntil != null ? ' · until ${_fmtHour(focusUntil)}' : ''}'
                                : 'Available',
                            style: GoogleFonts.jetBrainsMono(
                              color: focusOn
                                  ? AppColors.accent
                                  : AppColors.textSecondary,
                              fontSize: 11,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
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

  static String _fmtHour(DateTime dt) {
    final h = dt.hour % 12 == 0 ? 12 : dt.hour % 12;
    final m = dt.minute.toString().padLeft(2, '0');
    final ap = dt.hour >= 12 ? 'PM' : 'AM';
    return '$h:$m $ap';
  }
}

class _GearButton extends StatelessWidget {
  const _GearButton({required this.onTap});
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      customBorder: const CircleBorder(),
      child: Container(
        width: 38,
        height: 38,
        decoration: const BoxDecoration(
          color: AppColors.surface,
          shape: BoxShape.circle,
        ),
        alignment: Alignment.center,
        child: const Icon(LucideIcons.settings,
            color: AppColors.textPrimary, size: 18),
      ),
    );
  }
}

class _BackButton extends StatelessWidget {
  const _BackButton({required this.onTap});
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    // Matches the 38×38 surface circle pattern used for the gear button.
    return InkWell(
      onTap: onTap,
      customBorder: const CircleBorder(),
      child: Container(
        width: 38,
        height: 38,
        decoration: const BoxDecoration(
          color: AppColors.surface,
          shape: BoxShape.circle,
        ),
        alignment: Alignment.center,
        child: const Icon(LucideIcons.arrowLeft,
            color: AppColors.textPrimary, size: 18),
      ),
    );
  }
}

class _BigAvatar extends StatelessWidget {
  const _BigAvatar({required this.initial});
  final String initial;
  @override
  Widget build(BuildContext context) {
    // Design mAv: 60×60 cornerRadius 30 accent, text 26/700 mono black.
    return Container(
      width: 60,
      height: 60,
      decoration: const BoxDecoration(
        color: AppColors.accent,
        shape: BoxShape.circle,
      ),
      alignment: Alignment.center,
      child: Text(
        initial,
        style: GoogleFonts.jetBrainsMono(
          color: AppColors.background,
          fontSize: 26,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

class _StatsBlock extends StatelessWidget {
  const _StatsBlock({required this.stats});
  final MeStats stats;
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
      child: Row(
        children: [
          Expanded(child: _StatCard(label: 'INBOX', value: stats.inboxUnread)),
          const SizedBox(width: 10),
          Expanded(child: _StatCard(label: 'EVENTS', value: stats.eventsToday)),
          const SizedBox(width: 10),
          Expanded(child: _StatCard(label: 'TASKS', value: stats.tasksOpen)),
        ],
      ),
    );
  }
}

class _StatCard extends StatelessWidget {
  const _StatCard({required this.label, required this.value});
  final String label;
  final int value;
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: GoogleFonts.jetBrainsMono(
              color: AppColors.textSecondary,
              fontSize: 9,
              fontWeight: FontWeight.w600,
              letterSpacing: 1,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            '$value',
            style: GoogleFonts.jetBrainsMono(
              color: AppColors.textPrimary,
              fontSize: 22,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

class _PreferencesBlock extends StatelessWidget {
  const _PreferencesBlock({
    required this.prefs,
    required this.accounts,
    required this.onToggleFocus,
    required this.onNotificationsTap,
    required this.onConnectedTap,
  });
  final MePreferences prefs;
  final List<MeConnectedAccount> accounts;
  final VoidCallback onToggleFocus;
  final VoidCallback onNotificationsTap;
  final VoidCallback onConnectedTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _Eyebrow('PREFERENCES'),
          const SizedBox(height: 10),
          Container(
            decoration: BoxDecoration(
              color: AppColors.surface,
              borderRadius: BorderRadius.circular(14),
            ),
            child: Column(
              children: [
                _PrefRow(
                  icon: LucideIcons.moon,
                  iconFill: AppColors.accentDim,
                  iconColor: AppColors.accent,
                  title: 'Focus mode',
                  subtitle: prefs.focusModeEnabled
                      ? 'Mute non-urgent${prefs.focusModeUntil != null ? ' · until ${_fmtHour(prefs.focusModeUntil!)}' : ''}'
                      : 'Mute non-urgent · off',
                  trailing: _IosToggle(
                    value: prefs.focusModeEnabled,
                    onChanged: (_) => onToggleFocus(),
                  ),
                  onTap: onToggleFocus,
                ),
                const _RowDivider(),
                _PrefRow(
                  icon: LucideIcons.bell,
                  iconFill: const Color(0xFF1B6FE0).withValues(alpha: 0.2),
                  iconColor: const Color(0xFF6FAEFF),
                  title: 'Notifications',
                  subtitle: _notifSubtitle(prefs.notificationPrefs),
                  trailing: const _Chevron(),
                  onTap: onNotificationsTap,
                ),
                const _RowDivider(),
                _PrefRow(
                  icon: LucideIcons.plug,
                  iconFill: const Color(0xFF6D4AD4).withValues(alpha: 0.2),
                  iconColor: const Color(0xFFB89AFF),
                  title: 'Connected accounts',
                  subtitle: _accountsSubtitle(accounts),
                  trailing: const _Chevron(),
                  onTap: onConnectedTap,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  static String _notifSubtitle(MeNotificationPrefs p) {
    final parts = <String>[];
    if (p.mail) parts.add('Mail');
    if (p.chat) parts.add('chat');
    if (p.calendar) parts.add('calendar');
    if (parts.isEmpty) return 'All muted';
    return parts.join(', ').replaceFirstMapped(
          RegExp(r'^(\w)'),
          (m) => m.group(1)!.toUpperCase(),
        );
  }

  static String _accountsSubtitle(List<MeConnectedAccount> accts) {
    if (accts.isEmpty) return 'Add an account';
    return accts.take(3).map((a) => a.address.split('@').last).join(' · ');
  }

  static String _fmtHour(DateTime dt) {
    final h = dt.hour % 12 == 0 ? 12 : dt.hour % 12;
    final m = dt.minute.toString().padLeft(2, '0');
    final ap = dt.hour >= 12 ? 'PM' : 'AM';
    return '$h:$m $ap';
  }
}

class _QuickBlock extends StatelessWidget {
  const _QuickBlock();
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _Eyebrow('QUICK'),
          const SizedBox(height: 10),
          Container(
            decoration: BoxDecoration(
              color: AppColors.surface,
              borderRadius: BorderRadius.circular(14),
            ),
            child: Column(
              children: [
                _PrefRow(
                  icon: LucideIcons.star,
                  iconFill: const Color(0xFFD4A24A).withValues(alpha: 0.2),
                  iconColor: const Color(0xFFF5C77E),
                  title: 'Starred',
                  subtitle: '17 items',
                  trailing: const _Chevron(),
                  onTap: () {},
                ),
                const _RowDivider(),
                _PrefRow(
                  icon: LucideIcons.archive,
                  iconFill: const Color(0xFF3DB874).withValues(alpha: 0.2),
                  iconColor: const Color(0xFF6FD49A),
                  title: 'Snoozed',
                  subtitle: '4 items',
                  trailing: const _Chevron(),
                  onTap: () {},
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _PrefRow extends StatelessWidget {
  const _PrefRow({
    required this.icon,
    required this.iconFill,
    required this.iconColor,
    required this.title,
    required this.subtitle,
    required this.trailing,
    required this.onTap,
  });
  final IconData icon;
  final Color iconFill;
  final Color iconColor;
  final String title;
  final String subtitle;
  final Widget trailing;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            _IconBadge(icon: icon, fill: iconFill, color: iconColor),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: GoogleFonts.jetBrainsMono(
                      color: AppColors.textPrimary,
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    subtitle,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: GoogleFonts.jetBrainsMono(
                      color: AppColors.textSecondary,
                      fontSize: 11,
                    ),
                  ),
                ],
              ),
            ),
            trailing,
          ],
        ),
      ),
    );
  }
}

class _IconBadge extends StatelessWidget {
  const _IconBadge({required this.icon, required this.fill, required this.color});
  final IconData icon;
  final Color fill;
  final Color color;
  @override
  Widget build(BuildContext context) {
    return Container(
      width: 32,
      height: 32,
      decoration: BoxDecoration(
        color: fill,
        borderRadius: BorderRadius.circular(8),
      ),
      alignment: Alignment.center,
      child: Icon(icon, color: color, size: 16),
    );
  }
}

class _IosToggle extends StatelessWidget {
  const _IosToggle({required this.value, required this.onChanged});
  final bool value;
  final ValueChanged<bool> onChanged;
  @override
  Widget build(BuildContext context) {
    // Design tog: 40w × 24h, cornerRadius 12, fill accent when on,
    // padding 2, thumb 20×20 ellipse black, aligned end when on.
    return GestureDetector(
      onTap: () => onChanged(!value),
      child: Container(
        width: 40,
        height: 24,
        padding: const EdgeInsets.all(2),
        decoration: BoxDecoration(
          color: value ? AppColors.accent : AppColors.surfaceElevated,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Align(
          alignment: value ? Alignment.centerRight : Alignment.centerLeft,
          child: Container(
            width: 20,
            height: 20,
            decoration: BoxDecoration(
              color: value ? AppColors.background : AppColors.textSecondary,
              shape: BoxShape.circle,
            ),
          ),
        ),
      ),
    );
  }
}

class _Chevron extends StatelessWidget {
  const _Chevron();
  @override
  Widget build(BuildContext context) {
    return const Icon(LucideIcons.chevronRight,
        color: AppColors.textSecondary, size: 16);
  }
}

class _RowDivider extends StatelessWidget {
  const _RowDivider();
  @override
  Widget build(BuildContext context) {
    return Container(height: 1, color: AppColors.border);
  }
}

class _Eyebrow extends StatelessWidget {
  const _Eyebrow(this.label);
  final String label;
  @override
  Widget build(BuildContext context) {
    return Text(
      label,
      style: GoogleFonts.jetBrainsMono(
        color: AppColors.textSecondary,
        fontSize: 10,
        fontWeight: FontWeight.w700,
        letterSpacing: 1.5,
      ),
    );
  }
}

class _SheetSwitch extends StatelessWidget {
  const _SheetSwitch({
    required this.label,
    required this.value,
    required this.onChanged,
  });
  final String label;
  final bool value;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          Expanded(
            child: Text(
              label,
              style: GoogleFonts.jetBrainsMono(
                color: AppColors.textPrimary,
                fontSize: 14,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          _IosToggle(value: value, onChanged: onChanged),
        ],
      ),
    );
  }
}
