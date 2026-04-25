import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../../../core/network/api_exception.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../auth/presentation/providers/auth_controller.dart';
import '../../domain/today_summary.dart';
import '../providers/today_providers.dart';
import '../widgets/today_activity_row.dart';
import '../widgets/today_briefing_card.dart';
import '../widgets/today_needs_reply_row.dart';
import '../widgets/today_next_up_card.dart';
import '../widgets/today_schedule_row.dart';

/// MobileV3 Today — exact values from `design.lib.pen` node m2vKd.
///
/// Typography contract (carried through every text in the screen):
///   - Eyebrow: JetBrains Mono 10/700, letterSpacing 1, wm-text-tertiary
///   - Title: JetBrains Mono 28/700, wm-text-primary
///   - Section headers: JetBrains Mono 10/700, letterSpacing 1, tertiary
///   - Body labels: JetBrains Mono 11 (weights per design)
///
/// Layout contract:
///   - header padding [12, 20], justifyContent space_between
///   - scroll padding [4, 16, 20, 16], gap 14 between sections
class TodayScreen extends ConsumerWidget {
  const TodayScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final summary = ref.watch(todaySummaryProvider);
    final user = ref.watch(authControllerProvider).user;

    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _Header(userName: user?.name),
            Expanded(
              child: RefreshIndicator(
                color: AppColors.accent,
                backgroundColor: AppColors.surface,
                onRefresh: () async {
                  ref.invalidate(todaySummaryProvider);
                  await ref.read(todaySummaryProvider.future);
                },
                child: summary.when(
                  data: (s) => _Content(summary: s),
                  loading: () => const _LoadingState(),
                  error: (err, _) => _ErrorState(error: err),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({this.userName});
  final String? userName;

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final eyebrow = _formatEyebrow(now);
    final initial = (userName ?? 'Y').trim().isEmpty
        ? 'Y'
        : (userName ?? 'Y').trim()[0].toUpperCase();

    return Padding(
      // Design: padding [12, 20]
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          // Left column: gap 2, eyebrow + title
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  eyebrow,
                  style: GoogleFonts.jetBrainsMono(
                    color: AppColors.textTertiary,
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 1,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  'Today',
                  style: GoogleFonts.jetBrainsMono(
                    color: AppColors.textPrimary,
                    fontSize: 28,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ),
          // Right: gap 10, search button 40 + avatar 40
          _SearchButton(onTap: () => context.push('/search')),
          const SizedBox(width: 10),
          _AvatarButton(
            initial: initial,
            onTap: () => context.push('/me'),
          ),
        ],
      ),
    );
  }

  static String _formatEyebrow(DateTime now) {
    const weekdays = [
      'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY',
      'FRIDAY', 'SATURDAY', 'SUNDAY',
    ];
    const months = [
      'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
      'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
    ];
    return '${weekdays[now.weekday - 1]} · ${months[now.month - 1]} ${now.day}';
  }
}

class _SearchButton extends StatelessWidget {
  const _SearchButton({required this.onTap});
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    // Design sBtn: 40×40, surface fill, 1px border, cornerRadius 20.
    return InkWell(
      onTap: onTap,
      customBorder: const CircleBorder(),
      child: Container(
        width: 40,
        height: 40,
        decoration: BoxDecoration(
          color: AppColors.surface,
          shape: BoxShape.circle,
          border: Border.all(color: AppColors.border, width: 1),
        ),
        alignment: Alignment.center,
        child: const Icon(LucideIcons.search,
            size: 18, color: AppColors.textPrimary),
      ),
    );
  }
}

class _AvatarButton extends StatelessWidget {
  const _AvatarButton({required this.initial, required this.onTap});
  final String initial;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    // Design aBtn: 40×40, accent fill, cornerRadius 20, single-initial text
    // 14/700 mono, color wm-text-on-accent.
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 40,
        height: 40,
        decoration: const BoxDecoration(
          color: AppColors.accent,
          shape: BoxShape.circle,
        ),
        alignment: Alignment.center,
        child: Text(
          initial,
          style: GoogleFonts.jetBrainsMono(
            color: AppColors.background,
            fontSize: 14,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
    );
  }
}

class _Content extends StatelessWidget {
  const _Content({required this.summary});
  final TodaySummary summary;

  @override
  Widget build(BuildContext context) {
    if (summary.isEmpty) {
      return const _EmptyState();
    }
    // Design scroll: padding [4, 16, 20, 16], gap 14 between sections.
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 20),
      children: [
        if (summary.nextUp != null) ...[
          TodayNextUpCard(nextUp: summary.nextUp!),
          const SizedBox(height: 14),
        ],
        if (summary.digest != null) ...[
          TodayBriefingCard(digest: summary.digest!),
          const SizedBox(height: 14),
        ],
        if (summary.needsReply.isNotEmpty) ...[
          _SectionHeader(
            label: 'NEEDS REPLY · ${summary.needsReply.length}',
            trailing: const _AccentLink(label: 'SEE ALL'),
          ),
          const SizedBox(height: 10),
          for (int i = 0; i < summary.needsReply.length; i++) ...[
            TodayNeedsReplyRow(item: summary.needsReply[i]),
            if (i < summary.needsReply.length - 1)
              const SizedBox(height: 10),
          ],
          const SizedBox(height: 14),
        ],
        if (summary.schedule.isNotEmpty) ...[
          _SectionHeader(
            label: 'SCHEDULE · TODAY',
            trailing: _MutedLabel(
              '${summary.schedule.length} ${summary.schedule.length == 1 ? 'EVENT' : 'EVENTS'}',
            ),
          ),
          const SizedBox(height: 8),
          for (int i = 0; i < summary.schedule.length; i++) ...[
            TodayScheduleRow(event: summary.schedule[i]),
            if (i < summary.schedule.length - 1)
              const SizedBox(height: 8),
          ],
          const SizedBox(height: 14),
        ],
        if (summary.recentActivity.isNotEmpty) ...[
          const _SectionHeader(
            label: 'RECENT ACTIVITY',
            trailing: _AccentLink(label: 'ALL'),
          ),
          const SizedBox(height: 10),
          for (final a in summary.recentActivity) TodayActivityRow(item: a),
        ],
        const SizedBox(height: 20),
      ],
    );
  }
}

/// Design-exact section header — monospace 10/700 letterSpacing 1.
class _SectionHeader extends StatelessWidget {
  const _SectionHeader({required this.label, this.trailing});
  final String label;
  final Widget? trailing;
  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: Text(
            label,
            style: GoogleFonts.jetBrainsMono(
              color: AppColors.textTertiary,
              fontSize: 10,
              fontWeight: FontWeight.w700,
              letterSpacing: 1,
            ),
          ),
        ),
        if (trailing != null) trailing!,
      ],
    );
  }
}

class _AccentLink extends StatelessWidget {
  const _AccentLink({required this.label});
  final String label;
  @override
  Widget build(BuildContext context) {
    return Text(
      label,
      style: GoogleFonts.jetBrainsMono(
        color: AppColors.accent,
        fontSize: 10,
        fontWeight: FontWeight.w700,
        letterSpacing: 0.5,
      ),
    );
  }
}

class _MutedLabel extends StatelessWidget {
  const _MutedLabel(this.label);
  final String label;
  @override
  Widget build(BuildContext context) {
    return Text(
      label,
      style: GoogleFonts.jetBrainsMono(
        color: AppColors.textMuted,
        fontSize: 10,
        fontWeight: FontWeight.w600,
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState();
  @override
  Widget build(BuildContext context) {
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      children: [
        const SizedBox(height: 120),
        const Icon(LucideIcons.sunrise,
            color: AppColors.textTertiary, size: 48),
        const SizedBox(height: 16),
        Center(
          child: Text(
            'All clear for today.',
            style: GoogleFonts.jetBrainsMono(
              color: AppColors.textSecondary,
              fontSize: 14,
              fontWeight: FontWeight.w500,
            ),
          ),
        ),
      ],
    );
  }
}

class _LoadingState extends StatelessWidget {
  const _LoadingState();
  @override
  Widget build(BuildContext context) {
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 20),
      children: [
        _SkeletonCard(height: 180, radius: 16),
        const SizedBox(height: 14),
        _SkeletonCard(height: 64, radius: 12),
        const SizedBox(height: 10),
        _SkeletonCard(height: 64, radius: 12),
      ],
    );
  }
}

class _SkeletonCard extends StatelessWidget {
  const _SkeletonCard({required this.height, required this.radius});
  final double height;
  final double radius;
  @override
  Widget build(BuildContext context) {
    return Container(
      height: height,
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(radius),
      ),
    );
  }
}

/// Error placeholder. No retry button — the parent wraps us in a
/// RefreshIndicator, so pull-to-refresh is the sole recovery gesture.
class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.error});
  final Object error;
  @override
  Widget build(BuildContext context) {
    final (headline, hint) = _classify(error);
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(24, 80, 24, 24),
      children: [
        const Icon(LucideIcons.cloudOff,
            color: AppColors.textTertiary, size: 48),
        const SizedBox(height: 12),
        Center(
          child: Text(
            headline,
            textAlign: TextAlign.center,
            style: GoogleFonts.jetBrainsMono(
              color: AppColors.textPrimary,
              fontSize: 14,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
        const SizedBox(height: 6),
        Center(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8),
            child: Text(
              hint,
              maxLines: 4,
              overflow: TextOverflow.ellipsis,
              textAlign: TextAlign.center,
              style: GoogleFonts.jetBrainsMono(
                color: AppColors.textSecondary,
                fontSize: 11,
                height: 1.4,
              ),
            ),
          ),
        ),
      ],
    );
  }

  /// Pattern-match common failure shapes and return a short headline +
  /// a helpful hint. Anything we can't recognise falls back to a
  /// generic "something went wrong".
  static (String, String) _classify(Object err) {
    if (err is ApiException) {
      if (err.statusCode == 404) {
        return (
          "Today isn't available yet",
          'Pull down to retry.',
        );
      }
      if (err.isUnauthorized) {
        return ("Your session expired", 'Sign in again to continue.');
      }
      if (err.isNetwork) {
        return (
          "Can't reach the server",
          'Check your connection and pull down to retry.',
        );
      }
      return ("Couldn't load Today", 'Pull down to retry.');
    }
    return ("Couldn't load Today", 'Something went wrong. Pull down to retry.');
  }
}
