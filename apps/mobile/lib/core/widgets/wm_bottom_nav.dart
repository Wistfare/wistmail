import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../theme/app_colors.dart';

/// Five-icon icon rail. Active item is a solid lime square with a black
/// icon; inactive items are dark surface squares with a gray icon. Some
/// items can show a small red badge with a count (Mail, Chat unread).
///
/// Matches Mobile/Inbox, Mobile/ChatList, Mobile/Calendar, Mobile/Meet,
/// Mobile/Projects bottom rails.
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
    return Container(
      decoration: const BoxDecoration(
        color: AppColors.background,
        border: Border(top: BorderSide(color: AppColors.border, width: 1)),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
          child: Row(
            children: [
              _RailItem(
                icon: Icons.mail_outline,
                index: 0,
                currentIndex: currentIndex,
                badge: mailBadge,
                onTap: () => context.go(_routes[0]),
              ),
              _RailItem(
                icon: Icons.chat_bubble_outline,
                index: 1,
                currentIndex: currentIndex,
                badge: chatBadge,
                onTap: () => context.go(_routes[1]),
              ),
              _RailItem(
                icon: Icons.calendar_today_outlined,
                index: 2,
                currentIndex: currentIndex,
                onTap: () => context.go(_routes[2]),
              ),
              _RailItem(
                icon: Icons.videocam_outlined,
                index: 3,
                currentIndex: currentIndex,
                onTap: () => context.go(_routes[3]),
              ),
              _RailItem(
                icon: Icons.folder_outlined,
                index: 4,
                currentIndex: currentIndex,
                onTap: () => context.go(_routes[4]),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _RailItem extends StatelessWidget {
  const _RailItem({
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
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
          child: Stack(
            clipBehavior: Clip.none,
            children: [
              Container(
                height: 44,
                decoration: BoxDecoration(
                  color: active ? AppColors.accent : AppColors.surface,
                  border: active
                      ? null
                      : const Border.fromBorderSide(
                          BorderSide(color: AppColors.border, width: 1),
                        ),
                ),
                child: Center(
                  child: Icon(
                    icon,
                    size: 22,
                    color: active ? AppColors.background : AppColors.textTertiary,
                  ),
                ),
              ),
              if (badge != null && badge! > 0 && !active)
                Positioned(
                  top: -4,
                  right: -4,
                  child: Container(
                    constraints: const BoxConstraints(minWidth: 18, minHeight: 18),
                    padding: const EdgeInsets.symmetric(horizontal: 4),
                    decoration: const BoxDecoration(color: AppColors.danger),
                    alignment: Alignment.center,
                    child: Text(
                      badge! > 99 ? '99+' : '$badge',
                      style: GoogleFonts.jetBrainsMono(
                        fontSize: 10,
                        fontWeight: FontWeight.w700,
                        color: Colors.white,
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
