import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/wm_bottom_nav.dart';
import '../../../mail/presentation/providers/mail_providers.dart';
import '../../../chat/presentation/providers/chat_providers.dart';
import '../widgets/app_drawer.dart';

/// GlobalKey for the shell scaffold. Tab branches walk up to this to open
/// the drawer (which lives on the shell so it overlays the bottom nav).
final shellScaffoldKey = GlobalKey<ScaffoldState>(debugLabel: 'main-shell');

/// Hosts the five primary tabs (Inbox, Chat, Calendar, Meet, Projects) inside
/// a `StatefulShellRoute` so that switching tabs is instant and each branch
/// keeps its own scroll position + nested navigation stack. This is also
/// what keeps the bottom nav from flickering when the user taps tabs — only
/// the body of the shell rebuilds, not the bottom nav itself.
class MainShell extends ConsumerWidget {
  const MainShell({super.key, required this.navigationShell});

  final StatefulNavigationShell navigationShell;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Surface unread counts to the bottom nav badges. The mail count uses a
    // cached selector so the shell only rebuilds when the count actually
    // changes (not on every star/move/refresh).
    final mailUnread = ref.watch(inboxUnreadCountProvider);
    final chatUnread = ref.watch(
      chatListControllerProvider.select(
        (s) => s.conversations.fold<int>(0, (a, c) => a + c.unreadCount),
      ),
    );

    // Drawer lives on the shell scaffold so it overlays the bottom nav
    // and the drawer scrim covers the entire screen instead of the
    // tab body alone. Branches that need to open it call
    // `Scaffold.of(context).openDrawer()` against this scaffold.
    return Scaffold(
      key: shellScaffoldKey,
      backgroundColor: AppColors.background,
      drawer: const AppDrawer(),
      drawerScrimColor: AppColors.drawerOverlay,
      body: navigationShell,
      bottomNavigationBar: WmBottomNav(
        currentIndex: navigationShell.currentIndex,
        mailBadge: mailUnread,
        chatBadge: chatUnread,
        onTap: (index) => _goBranch(index),
      ),
    );
  }

  void _goBranch(int index) {
    navigationShell.goBranch(
      index,
      // Tapping the active tab again pops the branch back to its root —
      // the standard mobile-app gesture.
      initialLocation: index == navigationShell.currentIndex,
    );
  }
}
