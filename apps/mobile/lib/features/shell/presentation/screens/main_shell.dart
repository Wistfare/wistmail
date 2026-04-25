import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/wm_bottom_nav_v3.dart';
import '../../../chat/presentation/providers/chat_providers.dart';
import '../../../mail/presentation/providers/mail_providers.dart';

/// GlobalKey for the shell scaffold. Retained for callers that used to
/// open the drawer; now mostly unused since MobileV3 has no drawer.
final shellScaffoldKey = GlobalKey<ScaffoldState>(debugLabel: 'main-shell');

/// Hosts the four MobileV3 primary tabs — Today / Inbox / Calendar / Work —
/// inside a `StatefulShellRoute.indexedStack`. Each branch keeps its own
/// navigation stack + scroll position so returning to a tab feels instant.
///
/// The "Me" screen is not a bottom-nav tab; it's pushed on top of the
/// active tab via `/me` from the header avatar (see Today screen).
class MainShell extends ConsumerWidget {
  const MainShell({super.key, required this.navigationShell});

  final StatefulNavigationShell navigationShell;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final mailUnread = ref.watch(mailUnreadTotalProvider);
    final chatUnread = ref.watch(chatUnreadCountProvider);

    return Scaffold(
      key: shellScaffoldKey,
      backgroundColor: AppColors.background,
      body: navigationShell,
      bottomNavigationBar: WmBottomNavV3(
        currentIndex: navigationShell.currentIndex,
        inboxBadge: mailUnread + chatUnread,
        onTap: _goBranch,
      ),
    );
  }

  void _goBranch(int index) {
    navigationShell.goBranch(
      index,
      // Tapping the active tab again pops back to its root.
      initialLocation: index == navigationShell.currentIndex,
    );
  }
}
