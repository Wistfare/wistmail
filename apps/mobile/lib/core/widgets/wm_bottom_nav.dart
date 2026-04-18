import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../theme/app_colors.dart';

/// Bottom navigation matching the five tabs in the design:
/// Mail, Chat, Calendar, Meet, Projects.
class WmBottomNav extends StatelessWidget {
  const WmBottomNav({super.key, required this.currentIndex});

  final int currentIndex;

  static const _routes = ['/inbox', '/chat', '/calendar', '/meet', '/projects'];

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        border: Border(top: BorderSide(color: AppColors.border, width: 1)),
        color: AppColors.background,
      ),
      child: SafeArea(
        top: false,
        child: SizedBox(
          height: 56,
          child: Row(
            children: [
              _NavItem(
                icon: Icons.mail_outline,
                index: 0,
                currentIndex: currentIndex,
                onTap: () => context.go(_routes[0]),
              ),
              _NavItem(
                icon: Icons.chat_bubble_outline,
                index: 1,
                currentIndex: currentIndex,
                onTap: () => context.go(_routes[1]),
              ),
              _NavItem(
                icon: Icons.calendar_today_outlined,
                index: 2,
                currentIndex: currentIndex,
                onTap: () => context.go(_routes[2]),
              ),
              _NavItem(
                icon: Icons.videocam_outlined,
                index: 3,
                currentIndex: currentIndex,
                onTap: () => context.go(_routes[3]),
              ),
              _NavItem(
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

class _NavItem extends StatelessWidget {
  const _NavItem({
    required this.icon,
    required this.index,
    required this.currentIndex,
    required this.onTap,
  });

  final IconData icon;
  final int index;
  final int currentIndex;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final isActive = index == currentIndex;
    return Expanded(
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        child: Center(
          child: Icon(
            icon,
            size: 24,
            color: isActive ? AppColors.accent : AppColors.textTertiary,
          ),
        ),
      ),
    );
  }
}
