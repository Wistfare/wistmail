import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../chat/presentation/providers/chat_providers.dart';
import '../../domain/unified_inbox_item.dart';
import '../providers/mail_providers.dart';
import '../providers/unified_inbox_providers.dart';

/// MobileV3 Inbox — pen node `TavhO`.
///
/// Header (padding [8,16,12,16], gap 4 vertical):
///   hRow space_between: "Inbox" 28/700 mono, actions row (gap 10):
///     compose 38×38 cornerRadius 19 wm-accent, icon pen-line 18 black;
///     filter 38×38 cornerRadius 19 wm-surface, icon sliders-horizontal 18 primary.
///   eyebrow "N UNREAD · M MENTIONS" 10/500 letterSpacing 1.5 secondary.
///
/// Segment chips (padding [0,16,12,16], gap 8):
///   each chip cornerRadius 18, padding [8,14], gap 6.
///   ALL: accent fill, "ALL" 11/700 black letterSpacing 1, count 11/700 black opacity 0.6.
///   MAIL/CHATS: surface fill, icon 12 + label 11/600 primary letterSpacing 1.
///
/// Feed: fill_container vertical list of day-bucket headers + rows.
///   Bucket label: padding [6,16] (first) / [10,16,6,16] (subsequent),
///   label 10/700 letterSpacing 1.5 secondary + count 10/600 secondary.
///   Row: padding [12,16] horizontal gap 12:
///     avatar 40×40 circle, initials 13/700 mono white (or black on accent).
///     column gap 3:
///       header space_between: left row (gap 6, name 14/700 + tag chips), time 11/normal secondary.
///       subject (unread): 13/600 primary; else snippet 13/normal secondary.
///       snippet (mail): 12/normal secondary.
///   Between rows: 1px wm-border divider.
class InboxScreenV3 extends ConsumerStatefulWidget {
  const InboxScreenV3({super.key});

  @override
  ConsumerState<InboxScreenV3> createState() => _InboxScreenV3State();
}

class _InboxScreenV3State extends ConsumerState<InboxScreenV3> {
  final ScrollController _scroll = ScrollController();

  @override
  void initState() {
    super.initState();
    _scroll.addListener(_maybeLoadMore);
  }

  @override
  void dispose() {
    _scroll.removeListener(_maybeLoadMore);
    _scroll.dispose();
    super.dispose();
  }

  void _maybeLoadMore() {
    if (_scroll.position.pixels > _scroll.position.maxScrollExtent - 300) {
      final filter = ref.read(unifiedInboxFilterProvider);
      ref.read(unifiedInboxControllerProvider(filter).notifier).loadMore();
    }
  }

  @override
  Widget build(BuildContext context) {
    final filter = ref.watch(unifiedInboxFilterProvider);
    final state = ref.watch(unifiedInboxControllerProvider(filter));
    final mailUnread = ref.watch(mailUnreadTotalProvider);
    final chatUnread = ref.watch(chatUnreadCountProvider);
    final totalUnread = mailUnread + chatUnread;

    final grouped = _groupByDay(state.items);

    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _Header(unreadCount: totalUnread, chatUnread: chatUnread),
            _SegmentRow(
              current: filter,
              allUnreadCount: totalUnread,
              mailUnreadCount: mailUnread,
              chatUnreadCount: chatUnread,
              onChange: (f) =>
                  ref.read(unifiedInboxFilterProvider.notifier).state = f,
            ),
            Expanded(
              child: RefreshIndicator(
                color: AppColors.accent,
                backgroundColor: AppColors.surface,
                onRefresh: () => ref
                    .read(unifiedInboxControllerProvider(filter).notifier)
                    .refresh(),
                child: state.isLoading
                    ? const _Loading()
                    : state.items.isEmpty
                    ? const _EmptyInbox()
                    : ListView.builder(
                        controller: _scroll,
                        physics: const AlwaysScrollableScrollPhysics(),
                        padding: EdgeInsets.zero,
                        itemCount:
                            grouped.length + (state.isLoadingMore ? 1 : 0),
                        itemBuilder: (context, i) {
                          if (i == grouped.length) {
                            return const Padding(
                              padding: EdgeInsets.all(16),
                              child: Center(
                                child: CircularProgressIndicator(
                                  color: AppColors.accent,
                                  strokeWidth: 2,
                                ),
                              ),
                            );
                          }
                          final entry = grouped[i];
                          if (entry.isHeader) {
                            return _BucketHeader(
                              label: entry.header!,
                              count: entry.count!,
                              isFirst: entry.isFirst!,
                            );
                          }
                          final prev = i > 0 ? grouped[i - 1] : null;
                          final showDivider = prev != null && !prev.isHeader;
                          return Column(
                            children: [
                              if (showDivider)
                                Container(height: 1, color: AppColors.border),
                              _InboxRow(item: entry.item!),
                            ],
                          );
                        },
                      ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  List<_FeedEntry> _groupByDay(List<UnifiedInboxItem> items) {
    if (items.isEmpty) return const [];
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final yesterday = today.subtract(const Duration(days: 1));
    final weekAgo = today.subtract(const Duration(days: 7));

    String bucketLabel(DateTime t) {
      final d = DateTime(t.year, t.month, t.day);
      if (!d.isBefore(today)) return 'TODAY';
      if (!d.isBefore(yesterday)) return 'YESTERDAY';
      if (!d.isBefore(weekAgo)) return 'LAST WEEK';
      return 'OLDER';
    }

    // Count items per bucket so headers can show "TODAY · 12".
    final counts = <String, int>{};
    for (final item in items) {
      final label = bucketLabel(item.occurredAt);
      counts[label] = (counts[label] ?? 0) + 1;
    }

    final out = <_FeedEntry>[];
    String? lastHeader;
    var headerIndex = 0;
    for (final item in items) {
      final label = bucketLabel(item.occurredAt);
      if (label != lastHeader) {
        out.add(
          _FeedEntry.header(
            header: label,
            count: counts[label] ?? 0,
            isFirst: headerIndex == 0,
          ),
        );
        headerIndex++;
        lastHeader = label;
      }
      out.add(_FeedEntry.item(item));
    }
    return out;
  }
}

class _FeedEntry {
  _FeedEntry.header({
    required this.header,
    required this.count,
    required this.isFirst,
  }) : item = null;
  _FeedEntry.item(this.item) : header = null, count = null, isFirst = null;
  final String? header;
  final int? count;
  final bool? isFirst;
  final UnifiedInboxItem? item;
  bool get isHeader => header != null;
}

class _Header extends StatelessWidget {
  const _Header({required this.unreadCount, required this.chatUnread});
  final int unreadCount;
  final int chatUnread;
  @override
  Widget build(BuildContext context) {
    final eyebrow = unreadCount == 0
        ? 'ALL CAUGHT UP'
        : '$unreadCount UNREAD · $chatUnread CHATS';
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  'Inbox',
                  style: GoogleFonts.jetBrainsMono(
                    color: AppColors.textPrimary,
                    fontSize: 28,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              _ComposeButton(onTap: () => context.push('/compose')),
              const SizedBox(width: 10),
              _FilterButton(
                onTap: () {
                  // Filter sheet lives inside the segment row today;
                  // the icon slot is kept for parity with the design.
                },
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            eyebrow,
            style: GoogleFonts.jetBrainsMono(
              color: AppColors.textSecondary,
              fontSize: 10,
              fontWeight: FontWeight.w500,
              letterSpacing: 1.5,
            ),
          ),
        ],
      ),
    );
  }
}

class _ComposeButton extends StatelessWidget {
  const _ComposeButton({required this.onTap});
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
          color: AppColors.accent,
          shape: BoxShape.circle,
        ),
        alignment: Alignment.center,
        child: const Icon(
          LucideIcons.penLine,
          color: AppColors.background,
          size: 18,
        ),
      ),
    );
  }
}

class _FilterButton extends StatelessWidget {
  const _FilterButton({required this.onTap});
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
        child: const Icon(
          LucideIcons.slidersHorizontal,
          color: AppColors.textPrimary,
          size: 18,
        ),
      ),
    );
  }
}

class _SegmentRow extends StatelessWidget {
  const _SegmentRow({
    required this.current,
    required this.allUnreadCount,
    required this.mailUnreadCount,
    required this.chatUnreadCount,
    required this.onChange,
  });
  final UnifiedFilter current;
  final int allUnreadCount;
  final int mailUnreadCount;
  final int chatUnreadCount;
  final ValueChanged<UnifiedFilter> onChange;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
      child: Row(
        children: [
          _Segment(
            label: 'ALL',
            trailingCount: allUnreadCount,
            active: current == UnifiedFilter.all,
            onTap: () => onChange(UnifiedFilter.all),
          ),
          const SizedBox(width: 8),
          _Segment(
            icon: LucideIcons.mail,
            label: 'MAIL',
            trailingCount: mailUnreadCount,
            active: current == UnifiedFilter.mail,
            onTap: () => onChange(UnifiedFilter.mail),
          ),
          const SizedBox(width: 8),
          _Segment(
            icon: LucideIcons.messageSquare,
            label: 'CHATS',
            trailingCount: chatUnreadCount,
            active: current == UnifiedFilter.chats,
            onTap: () => onChange(UnifiedFilter.chats),
          ),
        ],
      ),
    );
  }
}

class _Segment extends StatelessWidget {
  const _Segment({
    required this.label,
    required this.active,
    required this.onTap,
    this.icon,
    this.trailingCount,
  });
  final String label;
  final bool active;
  final VoidCallback onTap;
  final IconData? icon;
  final int? trailingCount;

  @override
  Widget build(BuildContext context) {
    final textColor = active ? AppColors.background : AppColors.textPrimary;
    final countColor = active
        ? AppColors.background.withValues(alpha: 0.62)
        : AppColors.textSecondary;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(18),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          color: active ? AppColors.accent : AppColors.surface,
          borderRadius: BorderRadius.circular(18),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (icon != null) ...[
              Icon(icon, size: 12, color: textColor),
              const SizedBox(width: 6),
            ],
            Text(
              label,
              style: GoogleFonts.jetBrainsMono(
                color: textColor,
                fontSize: 11,
                fontWeight: active ? FontWeight.w700 : FontWeight.w600,
                letterSpacing: 1,
              ),
            ),
            if ((trailingCount ?? 0) > 0) ...[
              const SizedBox(width: 6),
              Text(
                '$trailingCount',
                style: GoogleFonts.jetBrainsMono(
                  color: countColor,
                  fontSize: 10,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _BucketHeader extends StatelessWidget {
  const _BucketHeader({
    required this.label,
    required this.count,
    required this.isFirst,
  });
  final String label;
  final int count;
  final bool isFirst;
  @override
  Widget build(BuildContext context) {
    // Design: first header padding [6,16], subsequent [10,16,6,16].
    return Container(
      color: AppColors.background,
      padding: EdgeInsets.fromLTRB(16, isFirst ? 6 : 10, 16, 6),
      child: Row(
        children: [
          Expanded(
            child: Text(
              label,
              style: GoogleFonts.jetBrainsMono(
                color: AppColors.textSecondary,
                fontSize: 10,
                fontWeight: FontWeight.w700,
                letterSpacing: 1.5,
              ),
            ),
          ),
          Text(
            '$count',
            style: GoogleFonts.jetBrainsMono(
              color: AppColors.textSecondary,
              fontSize: 10,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

class _InboxRow extends StatelessWidget {
  const _InboxRow({required this.item});
  final UnifiedInboxItem item;

  @override
  Widget build(BuildContext context) {
    final unread = item.isUnread;
    final senderColor = unread
        ? AppColors.textPrimary
        : AppColors.textSecondary;
    final primaryColor = unread
        ? AppColors.textPrimary
        : AppColors.textSecondary;
    final secondaryColor = unread
        ? AppColors.textSecondary
        : AppColors.textMuted;
    return InkWell(
      onTap: () {
        if (item.source == UnifiedSource.mail && item.emailId != null) {
          context.push('/email/${item.emailId}');
        } else if (item.source == UnifiedSource.chat &&
            item.conversationId != null) {
          context.push('/conversation/${item.conversationId}');
        }
      },
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _Avatar(item: item),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Row(
                          children: [
                            Flexible(
                              child: Text(
                                item.senderName,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: GoogleFonts.jetBrainsMono(
                                  color: senderColor,
                                  fontSize: 14,
                                  fontWeight: unread
                                      ? FontWeight.w700
                                      : FontWeight.w500,
                                ),
                              ),
                            ),
                            const SizedBox(width: 6),
                            _SourceTag(item: item),
                          ],
                        ),
                      ),
                      const SizedBox(width: 8),
                      Text(
                        _age(item.occurredAt),
                        style: GoogleFonts.jetBrainsMono(
                          color: AppColors.textSecondary,
                          fontSize: 11,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 3),
                  // When the preview is a subject (mail) show it as the
                  // primary line 13/600; when it's a title (chat) the
                  // snippet line is the primary content.
                  if (item.source == UnifiedSource.mail) ...[
                    Text(
                      item.preview,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: GoogleFonts.jetBrainsMono(
                        color: primaryColor,
                        fontSize: 13,
                        fontWeight: item.isUnread
                            ? FontWeight.w600
                            : FontWeight.w400,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      item.subtitle,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: GoogleFonts.jetBrainsMono(
                        color: secondaryColor,
                        fontSize: 12,
                      ),
                    ),
                  ] else ...[
                    Text(
                      item.subtitle,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: GoogleFonts.jetBrainsMono(
                        color: primaryColor,
                        fontSize: 13,
                        fontWeight: unread ? FontWeight.w600 : FontWeight.w400,
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  static String _age(DateTime t) {
    final delta = DateTime.now().difference(t);
    if (delta.inMinutes < 60) return '${delta.inMinutes}m';
    if (delta.inHours < 24) return '${delta.inHours}h';
    if (delta.inDays < 7) return '${delta.inDays}d';
    return '${(delta.inDays / 7).floor()}w';
  }
}

class _Avatar extends StatelessWidget {
  const _Avatar({required this.item});
  final UnifiedInboxItem item;

  // Palette pulled from the pen design (Inbox avatars).
  static const _palette = [
    Color(0xFF1B6FE0),
    Color(0xFFD44A4A),
    Color(0xFF6D4AD4),
    Color(0xFF3DB874),
    Color(0xFFD4A24A),
    Color(0xFF4A6FD4),
  ];

  Color _colorFor(String seed) {
    if (seed.isEmpty) return _palette[0];
    final hash = seed.codeUnits.fold<int>(0, (a, b) => a + b);
    return _palette[hash % _palette.length];
  }

  @override
  Widget build(BuildContext context) {
    final isGroupChannel =
        item.source == UnifiedSource.chat && item.chatKind == 'group';
    final initials = _initialsFor(item.senderName);
    return Container(
      width: 40,
      height: 40,
      decoration: BoxDecoration(
        color: isGroupChannel
            ? const Color(0xFF6D4AD4)
            : _colorFor(item.senderKey),
        shape: BoxShape.circle,
      ),
      alignment: Alignment.center,
      child: isGroupChannel
          ? const Icon(LucideIcons.hash, color: Colors.white, size: 18)
          : Text(
              initials,
              style: GoogleFonts.jetBrainsMono(
                color: Colors.white,
                fontSize: 13,
                fontWeight: FontWeight.w700,
              ),
            ),
    );
  }

  static String _initialsFor(String name) {
    final trimmed = name.trim();
    if (trimmed.isEmpty) return '?';
    final parts = trimmed
        .split(RegExp(r'\s+'))
        .where((p) => p.isNotEmpty)
        .toList();
    if (parts.length >= 2) {
      return (parts.first[0] + parts.last[0]).toUpperCase();
    }
    return parts.first.length >= 2
        ? parts.first.substring(0, 2).toUpperCase()
        : parts.first[0].toUpperCase();
  }
}

class _SourceTag extends StatelessWidget {
  const _SourceTag({required this.item});
  final UnifiedInboxItem item;

  @override
  Widget build(BuildContext context) {
    // Tag style follows the pen's exact mapping per source/kind.
    final (String label, Color fill, Color fg) = _tagStyle();
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: fill,
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        label,
        style: GoogleFonts.jetBrainsMono(
          color: fg,
          fontSize: 8,
          fontWeight: FontWeight.w700,
          letterSpacing: 1,
        ),
      ),
    );
  }

  (String, Color, Color) _tagStyle() {
    if (item.source == UnifiedSource.mail) {
      return ('MAIL', AppColors.accentDim, AppColors.accent);
    }
    if (item.chatKind == 'group') {
      // Channel. @YOU mention overrides when detected.
      if (item.preview.contains('@') && item.isUnread) {
        return ('@YOU', AppColors.accent, AppColors.background);
      }
      return (
        'CHANNEL',
        const Color(0xFF6D4AD4).withValues(alpha: 0.2),
        const Color(0xFFB89AFF),
      );
    }
    // direct chat
    return (
      'CHAT',
      const Color(0xFF1B6FE0).withValues(alpha: 0.2),
      const Color(0xFF6FAEFF),
    );
  }
}

class _Loading extends StatelessWidget {
  const _Loading();
  @override
  Widget build(BuildContext context) {
    return ListView.separated(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: EdgeInsets.zero,
      itemCount: 8,
      separatorBuilder: (context, index) =>
          const Divider(height: 1, color: AppColors.border),
      itemBuilder: (context, i) => _SkeletonRow(seed: i),
    );
  }
}

class _SkeletonRow extends StatelessWidget {
  const _SkeletonRow({required this.seed});
  final int seed;

  @override
  Widget build(BuildContext context) {
    final nameWidth = 72 + (seed * 13) % 58;
    final firstLineWidth = 170 + (seed * 19) % 110;
    final secondLineWidth = 210 + (seed * 17) % 90;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _SkeletonBar(width: 40, height: 40, radius: 20),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    _SkeletonBar(width: nameWidth.toDouble(), height: 13),
                    const SizedBox(width: 8),
                    const _SkeletonBar(width: 36, height: 16, radius: 4),
                    const Spacer(),
                    const _SkeletonBar(width: 24, height: 11),
                  ],
                ),
                const SizedBox(height: 7),
                _SkeletonBar(width: firstLineWidth.toDouble(), height: 13),
                const SizedBox(height: 6),
                _SkeletonBar(width: secondLineWidth.toDouble(), height: 12),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _SkeletonBar extends StatelessWidget {
  const _SkeletonBar({
    required this.width,
    required this.height,
    this.radius = 2,
  });

  final double width;
  final double height;
  final double radius;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(radius),
      ),
    );
  }
}

class _EmptyInbox extends StatelessWidget {
  const _EmptyInbox();
  @override
  Widget build(BuildContext context) {
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      children: [
        const SizedBox(height: 100),
        const Icon(LucideIcons.inbox, color: AppColors.textTertiary, size: 56),
        const SizedBox(height: 12),
        Center(
          child: Text(
            'Nothing new',
            style: GoogleFonts.jetBrainsMono(
              color: AppColors.textPrimary,
              fontSize: 14,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
      ],
    );
  }
}
