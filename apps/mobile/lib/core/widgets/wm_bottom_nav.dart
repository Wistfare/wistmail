import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../theme/app_colors.dart';

/// Mobile bottom navigation matching design.lib.pen `dufVq` (tabBarWrap)
/// inside Mobile/Inbox `DSAIy`.
///
/// Layout:
///   - Outer wrapper: 21px horizontal & bottom padding, 12px top
///   - Inner pill: 62px tall, surface fill (#111111), 1px border (#1A1A1A)
///   - 5 equal-width tabs flush against each other (no gaps)
///   - Active tab: solid lime fill, black icon
///   - Inactive tab: transparent (pill shows through), gray icon
///   - Optional small lime / red marker at top-right of an inactive tab
class WmBottomNav extends StatelessWidget {
  const WmBottomNav({
    super.key,
    required this.currentIndex,
    this.mailBadge,
    this.chatBadge,
  });

  final int currentIndex;
  final int? mailBadge;
  final int? chatBadge;

  static const _routes = ['/inbox', '/chat', '/calendar', '/meet', '/projects'];

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.background,
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(21, 12, 21, 21),
          child: Container(
            height: 62,
            decoration: const BoxDecoration(
              color: AppColors.surface,
              border: Border.fromBorderSide(
                BorderSide(color: AppColors.border, width: 1),
              ),
            ),
            child: Row(
              children: [
                _Tab(
                  icon: Icons.mail_outline,
                  index: 0,
                  currentIndex: currentIndex,
                  badge: mailBadge,
                  onTap: () => context.go(_routes[0]),
                ),
                _Tab(
                  icon: Icons.chat_bubble_outline,
                  index: 1,
                  currentIndex: currentIndex,
                  badge: chatBadge,
                  onTap: () => context.go(_routes[1]),
                ),
                _Tab(
                  icon: Icons.calendar_today_outlined,
                  index: 2,
                  currentIndex: currentIndex,
                  onTap: () => context.go(_routes[2]),
                ),
                _Tab(
                  icon: Icons.videocam_outlined,
                  index: 3,
                  currentIndex: currentIndex,
                  onTap: () => context.go(_routes[3]),
                ),
                _Tab(
                  icon: Icons.folder_outlined,
                  index: 4,
                  currentIndex: currentIndex,
                  onTap: () => context.go(_routes[4]),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Tab extends StatelessWidget {
  const _Tab({
    required this.icon,
    required this.index,
    required this.currentIndex,
    required this.onTap,
    this.badge,
  });

  final IconData icon;
  final int index;
  final int currentIndex;
  final VoidCallback onTap;
  final int? badge;

  @override
  Widget build(BuildContext context) {
    final active = index == currentIndex;
    return Expanded(
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        child: Container(
          color: active ? AppColors.accent : Colors.transparent,
          child: Stack(
            clipBehavior: Clip.none,
            children: [
              Center(
                child: Icon(
                  icon,
                  size: 22,
                  color: active ? AppColors.background : AppColors.textTertiary,
                ),
              ),
              if (!active && badge != null && badge! > 0)
                Positioned(
                  top: 10,
                  right: 18,
                  child: Container(
                    constraints:
                        const BoxConstraints(minWidth: 16, minHeight: 16),
                    padding: const EdgeInsets.symmetric(horizontal: 4),
                    decoration: const BoxDecoration(color: AppColors.danger),
                    alignment: Alignment.center,
                    child: Text(
                      badge! > 99 ? '99+' : '$badge',
                      style: GoogleFonts.jetBrainsMono(
                        fontSize: 9,
                        fontWeight: FontWeight.w700,
                        color: Colors.white,
                        height: 1.1,
                      ),
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
