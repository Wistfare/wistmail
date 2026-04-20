import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../auth/presentation/providers/auth_controller.dart';
import '../providers/mail_providers.dart';
import '../widgets/email_list_item.dart';
import '../widgets/email_list_skeleton.dart';
import '../widgets/sync_status_pill.dart';
import '../../../shell/presentation/screens/main_shell.dart';

/// Mobile/Inbox — design.lib.pen node `DSAIy`.
class InboxScreen extends ConsumerWidget {
  const InboxScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final inbox = ref.watch(inboxControllerProvider);
    final unreadCount = ref.watch(inboxUnreadCountProvider);
    final user = ref.watch(authControllerProvider).user;
    final showMfaBanner = user?.needsMfaSetup ?? false;

    // Auth gating happens in the router's redirect — no listener needed here.

    // Drawer lives on the MainShell scaffold so it overlays the bottom
    // nav and the scrim covers the entire screen. The hamburger button
    // walks up to that scaffold via Scaffold.of with the root context.
    return Scaffold(
      backgroundColor: AppColors.background,
      body: Column(
        children: [
          _TopBar(unreadCount: unreadCount),
          if (showMfaBanner) const _MfaBanner(),
          Expanded(child: _InboxBody(inbox: inbox)),
        ],
      ),
      floatingActionButton: Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: SizedBox(
          width: 56,
          height: 56,
          child: FloatingActionButton(
            onPressed: () => context.push('/compose'),
            backgroundColor: AppColors.accent,
            elevation: 0,
            highlightElevation: 0,
            shape: const RoundedRectangleBorder(),
            child: const Icon(Icons.edit_outlined,
                color: AppColors.background, size: 22),
          ),
        ),
      ),
    );
  }
}

class _TopBar extends StatelessWidget {
  const _TopBar({required this.unreadCount});
  final int unreadCount;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      bottom: false,
      child: Container(
        padding: const EdgeInsets.fromLTRB(12, 6, 8, 6),
        child: Row(
          children: [
            // Open the shell-level drawer so it overlays the bottom nav.
            IconButton(
              splashRadius: 22,
              icon: const Icon(Icons.menu, size: 24),
              color: AppColors.textPrimary,
              onPressed: () => shellScaffoldKey.currentState?.openDrawer(),
            ),
            const SizedBox(width: 4),
            Text('Inbox', style: AppTextStyles.titleLarge),
            if (unreadCount > 0) ...[
              const SizedBox(width: 10),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                color: AppColors.accent,
                child: Text(
                  '$unreadCount',
                  style: GoogleFonts.jetBrainsMono(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: AppColors.background,
                    height: 1.1,
                  ),
                ),
              ),
            ],
            const SizedBox(width: 8),
            const SyncStatusPill(),
            const Spacer(),
            IconButton(
              splashRadius: 22,
              icon: const Icon(Icons.search, size: 22),
              color: AppColors.textSecondary,
              onPressed: () => context.push('/search'),
            ),
            IconButton(
              splashRadius: 22,
              icon: const Icon(Icons.tune, size: 20),
              color: AppColors.textSecondary,
              onPressed: () {},
            ),
          ],
        ),
      ),
    );
  }
}

class _MfaBanner extends StatelessWidget {
  const _MfaBanner();

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.accentDim,
      child: InkWell(
        onTap: () => context.push('/auth/mfa/setup'),
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
          decoration: const BoxDecoration(
            border: Border(
              bottom: BorderSide(color: AppColors.border, width: 1),
            ),
          ),
          child: Row(
            children: [
              const Icon(Icons.shield_outlined,
                  size: 16, color: AppColors.accent),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  'Set up two-factor authentication',
                  style: GoogleFonts.inter(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: AppColors.accent,
                  ),
                ),
              ),
              const Icon(Icons.chevron_right,
                  size: 16, color: AppColors.accent),
            ],
          ),
        ),
      ),
    );
  }
}

class _InboxBody extends ConsumerStatefulWidget {
  const _InboxBody({required this.inbox});
  final InboxState inbox;

  @override
  ConsumerState<_InboxBody> createState() => _InboxBodyState();
}

class _InboxBodyState extends ConsumerState<_InboxBody> {
  late final ScrollController _scrollController;

  @override
  void initState() {
    super.initState();
    _scrollController = ScrollController()..addListener(_onScroll);
  }

  @override
  void dispose() {
    _scrollController
      ..removeListener(_onScroll)
      ..dispose();
    super.dispose();
  }

  void _onScroll() {
    if (!_scrollController.hasClients) return;
    final pos = _scrollController.position;
    // Trigger ~600px before the bottom so the next page is in flight by
    // the time the user reaches the end of the list.
    if (pos.pixels >= pos.maxScrollExtent - 600) {
      ref.read(inboxControllerProvider.notifier).loadMore();
    }
  }

  @override
  Widget build(BuildContext context) {
    final inbox = widget.inbox;
    if (inbox.isLoading && !inbox.hasLoaded) {
      return MediaQuery.removePadding(
        context: context,
        removeTop: true,
        child: const EmailListSkeleton(),
      );
    }

    if (inbox.errorMessage != null && inbox.emails.isEmpty) {
      return _ErrorState(
        message: inbox.errorMessage!,
        onRetry: () => ref.read(inboxControllerProvider.notifier).refresh(),
      );
    }

    if (inbox.emails.isEmpty) return const _EmptyState();

    return RefreshIndicator(
      color: AppColors.accent,
      backgroundColor: AppColors.surface,
      onRefresh: () => ref.read(inboxControllerProvider.notifier).refresh(),
      child: MediaQuery.removePadding(
        context: context,
        removeTop: true,
        child: ListView.separated(
          controller: _scrollController,
          padding: EdgeInsets.zero,
          physics: const AlwaysScrollableScrollPhysics(),
          // +1 row reserved for the load-more spinner / end marker so the
          // separator pattern stays consistent.
          itemCount: inbox.emails.length + (inbox.hasMore ? 1 : 0),
          separatorBuilder: (_, __) =>
              const Divider(height: 1, color: AppColors.border),
          itemBuilder: (context, index) {
            if (index >= inbox.emails.length) {
              return const _LoadMoreFooter();
            }
            return EmailListItem(email: inbox.emails[index]);
          },
        ),
      ),
    );
  }
}

class _LoadMoreFooter extends StatelessWidget {
  const _LoadMoreFooter();

  @override
  Widget build(BuildContext context) {
    return const Padding(
      padding: EdgeInsets.symmetric(vertical: 18),
      child: Center(
        child: SizedBox(
          width: 18,
          height: 18,
          child: CircularProgressIndicator(
            strokeWidth: 2,
            color: AppColors.accent,
          ),
        ),
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.inbox_outlined,
                color: AppColors.textTertiary, size: 40),
            const SizedBox(height: 16),
            Text('Your inbox is empty', style: AppTextStyles.titleMedium),
            const SizedBox(height: 6),
            Text('New emails will appear here.',
                style: AppTextStyles.bodySmall),
          ],
        ),
      ),
    );
  }
}

class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.message, required this.onRetry});
  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.error_outline, color: AppColors.danger, size: 36),
            const SizedBox(height: 16),
            Text(message,
                textAlign: TextAlign.center, style: AppTextStyles.bodySmall),
            const SizedBox(height: 16),
            TextButton(
              onPressed: onRetry,
              child: Text(
                'Try again',
                style: GoogleFonts.inter(
                  color: AppColors.accent,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
