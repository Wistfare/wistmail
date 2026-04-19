import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../../core/widgets/wm_avatar.dart';
import '../../../../core/widgets/wm_primary_button.dart';
import '../../../../core/widgets/wm_tag.dart';
import '../../domain/calendar_event.dart';
import '../providers/calendar_providers.dart';

/// Mobile/Meet — design.lib.pen node `Unbnv`. Lime "New Meeting" pill in
/// header, three quick tiles (Join / Schedule / Share Link), then
/// upcoming meeting cards with sharp lime "Join Meeting" buttons.
class MeetScreen extends ConsumerWidget {
  const MeetScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final meetings = ref.watch(upcomingMeetingsProvider);

    return Scaffold(
      backgroundColor: AppColors.background,
      body: Column(
        children: [
          _TopBar(onNew: () => context.push('/meet/new')),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 4, 20, 16),
            child: Row(
              children: [
                Expanded(
                  child: _QuickTile(
                    icon: Icons.login,
                    label: 'Join',
                    onTap: () => context.push('/meet/join'),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _QuickTile(
                    icon: Icons.calendar_today_outlined,
                    label: 'Schedule',
                    onTap: () => context.push('/meet/new'),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _QuickTile(
                    icon: Icons.share_outlined,
                    label: 'Share Link',
                    onTap: () {},
                  ),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 10),
            child: Align(
              alignment: Alignment.centerLeft,
              child: Text('UPCOMING MEETINGS',
                  style: AppTextStyles.sectionLabel),
            ),
          ),
          Expanded(
            child: meetings.when(
              data: (list) {
                if (list.isEmpty) {
                  return Center(
                    child: Text('No upcoming meetings',
                        style: AppTextStyles.bodySmall),
                  );
                }
                return ListView.builder(
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  itemCount: list.length,
                  itemBuilder: (context, index) =>
                      _MeetingCard(event: list[index]),
                );
              },
              loading: () => const Center(
                child: SizedBox(
                  width: 22,
                  height: 22,
                  child: CircularProgressIndicator(
                      strokeWidth: 2, color: AppColors.accent),
                ),
              ),
              error: (err, _) => Center(
                child: Padding(
                  padding: const EdgeInsets.all(32),
                  child: Text(err.toString(), style: AppTextStyles.bodySmall),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _TopBar extends StatelessWidget {
  const _TopBar({required this.onNew});
  final VoidCallback onNew;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      bottom: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 8, 12, 16),
        child: Row(
          children: [
            Text('Meet', style: AppTextStyles.titleLarge),
            const Spacer(),
            Material(
              color: AppColors.accent,
              child: InkWell(
                onTap: onNew,
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 14, vertical: 9),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.videocam_outlined,
                          size: 14, color: AppColors.background),
                      const SizedBox(width: 6),
                      Text(
                        'New Meeting',
                        style: GoogleFonts.inter(
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                          color: AppColors.background,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _QuickTile extends StatelessWidget {
  const _QuickTile(
      {required this.icon, required this.label, required this.onTap});
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.surface,
      child: InkWell(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 18),
          decoration: const BoxDecoration(
            border: Border.fromBorderSide(
              BorderSide(color: AppColors.border, width: 1),
            ),
          ),
          child: Column(
            children: [
              Icon(icon, color: AppColors.textPrimary, size: 20),
              const SizedBox(height: 8),
              Text(
                label,
                style: GoogleFonts.inter(
                  fontSize: 12,
                  fontWeight: FontWeight.w500,
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

class _MeetingCard extends StatelessWidget {
  const _MeetingCard({required this.event});
  final CalendarEvent event;

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final startsIn = event.startAt.difference(now);
    final startsSoon = startsIn.inMinutes >= -10 && startsIn.inMinutes <= 15;

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: const BoxDecoration(
        color: AppColors.surface,
        border: Border.fromBorderSide(
          BorderSide(color: AppColors.border, width: 1),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  event.title,
                  style: GoogleFonts.inter(
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                    color: AppColors.textPrimary,
                  ),
                ),
              ),
              if (startsSoon)
                WmAccentTag(
                  label: startsIn.inMinutes.abs() < 1
                      ? 'NOW'
                      : 'IN ${startsIn.inMinutes} MIN',
                ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            '${event.timeRangeLabel}${event.location != null ? ' • ${event.location}' : ''}',
            style: AppTextStyles.monoSmall.copyWith(fontSize: 12),
          ),
          if (event.attendees.isNotEmpty) ...[
            const SizedBox(height: 10),
            Row(
              children: [
                for (final a in event.attendees.take(3))
                  Padding(
                    padding: const EdgeInsets.only(right: 4),
                    child: WmAvatar(name: a, size: 22),
                  ),
                if (event.attendees.length > 3) ...[
                  const SizedBox(width: 4),
                  Text(
                    '+${event.attendees.length - 3}',
                    style: AppTextStyles.monoSmall.copyWith(fontSize: 11),
                  ),
                ],
              ],
            ),
          ],
          if (startsSoon) ...[
            const SizedBox(height: 12),
            WmPrimaryButton(
              label: 'Join Meeting',
              height: 44,
              onPressed: () => context.push('/call/video/${event.id}'),
            ),
          ],
        ],
      ),
    );
  }
}
