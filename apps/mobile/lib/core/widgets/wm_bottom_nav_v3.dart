import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../theme/app_colors.dart';

/// MobileV3 bottom nav — matches `design.lib.pen` tabBar on Inbox,
/// Calendar, Work (and Today when we align variants).
///
/// Exact pen values:
///   wrapper padding [8, 16, 20, 16]
///   inner pill: height 62, fill wm-surface, cornerRadius 36, padding 4,
///               justifyContent space_between
///   tabs: each fill_container, cornerRadius 32, height fill_container
///   active: fill wm-accent, icon color #000, size 18
///   inactive: no fill, icon color wm-text-secondary, size 18
///
/// Uses lucide icons exactly as named in the pen: sunrise, inbox,
/// calendar, briefcase.
class WmBottomNavV3 extends StatelessWidget {
  const WmBottomNavV3({
    super.key,
    required this.currentIndex,
    required this.onTap,
    this.inboxBadge,
  });

  final int currentIndex;
  final ValueChanged<int> onTap;
  final int? inboxBadge;

  // Icons pulled directly from `design.lib.pen` frames tt1..tt4 in
  // MobileV3/Today. Today uses `sun`, the rest match across screens.
  static const _items = <_NavItem>[
    _NavItem(icon: LucideIcons.sun, label: 'Today'),
    _NavItem(icon: LucideIcons.inbox, label: 'Inbox'),
    _NavItem(icon: LucideIcons.calendar, label: 'Calendar'),
    _NavItem(icon: LucideIcons.folderKanban, label: 'Work'),
  ];

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.background,
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 20),
          child: Container(
            height: 62,
            padding: const EdgeInsets.all(4),
            decoration: BoxDecoration(
              color: AppColors.surface,
              borderRadius: BorderRadius.circular(36),
            ),
            child: Row(
              children: List.generate(_items.length, (i) {
                final item = _items[i];
                final active = i == currentIndex;
                final badge = i == 1 ? inboxBadge ?? 0 : 0;
                return Expanded(
                  child: _Tab(
                    icon: item.icon,
                    label: item.label,
                    active: active,
                    badge: badge,
                    onTap: () => onTap(i),
                  ),
                );
              }),
            ),
          ),
        ),
      ),
    );
  }
}

class _NavItem {
  const _NavItem({required this.icon, required this.label});
  final IconData icon;
  final String label;
}

class _Tab extends StatelessWidget {
  const _Tab({
    required this.icon,
    required this.label,
    required this.active,
    required this.badge,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final bool active;
  final int badge;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(32),
      child: Semantics(
        label: label,
        selected: active,
        button: true,
        child: Container(
          decoration: BoxDecoration(
            color: active ? AppColors.accent : Colors.transparent,
            borderRadius: BorderRadius.circular(32),
          ),
          alignment: Alignment.center,
          child: Stack(
            clipBehavior: Clip.none,
            alignment: Alignment.center,
            children: [
              // 24 on device matches the visual weight of the pen's
              // rendered icons (the font declares 18 but ships stroke
              // widths that read heavier at the target tab size).
              Icon(
                icon,
                size: 24,
                color: active ? AppColors.background : AppColors.textSecondary,
              ),
              if (badge > 0)
                Positioned(
                  top: 1,
                  right: badge > 9 ? -12 : -8,
                  child: _UnreadBadge(count: badge),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _UnreadBadge extends StatelessWidget {
  const _UnreadBadge({required this.count});
  final int count;

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: const BoxConstraints(minWidth: 16, minHeight: 16),
      padding: const EdgeInsets.symmetric(horizontal: 4),
      decoration: BoxDecoration(
        color: AppColors.accent,
        borderRadius: BorderRadius.circular(8),
      ),
      alignment: Alignment.center,
      child: Text(
        count > 99 ? '99+' : '$count',
        style: const TextStyle(
          color: AppColors.background,
          fontSize: 9,
          fontWeight: FontWeight.w800,
          height: 1,
        ),
      ),
    );
  }
}
