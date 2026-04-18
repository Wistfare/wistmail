import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/wm_bottom_nav.dart';
import '../../../auth/presentation/providers/auth_controller.dart';
import '../providers/mail_providers.dart';
import '../widgets/email_list_item.dart';
import '../../../shell/presentation/widgets/app_drawer.dart';

class InboxScreen extends ConsumerWidget {
  const InboxScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final inbox = ref.watch(inboxControllerProvider);
    final unreadCount = inbox.emails.where((e) => !e.isRead).length;

    ref.listen<AuthState>(authControllerProvider, (prev, next) {
      if (!next.isAuthenticated && !next.isRestoring) {
        context.go('/auth/sign-in');
      }
    });

    return Scaffold(
      backgroundColor: AppColors.background,
      drawer: const AppDrawer(),
      appBar: AppBar(
        backgroundColor: AppColors.background,
        automaticallyImplyLeading: false,
        titleSpacing: 0,
        title: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Row(
            children: [
              Builder(
                builder: (context) => GestureDetector(
                  onTap: () => Scaffold.of(context).openDrawer(),
                  child: const Icon(Icons.menu, color: AppColors.textPrimary, size: 24),
                ),
              ),
              const SizedBox(width: 12),
              Text(
                'Inbox',
                style: GoogleFonts.inter(
                  fontSize: 20,
                  fontWeight: FontWeight.bold,
                  color: AppColors.textPrimary,
                ),
              ),
              if (unreadCount > 0) ...[
                const SizedBox(width: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                  decoration: BoxDecoration(
                    color: AppColors.accent,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Text(
                    '$unreadCount',
                    style: GoogleFonts.inter(
                      fontSize: 12,
                      fontWeight: FontWeight.bold,
                      color: AppColors.background,
                    ),
                  ),
                ),
              ],
              const Spacer(),
              IconButton(
                icon: const Icon(Icons.search, color: AppColors.textSecondary),
                onPressed: () => context.push('/search'),
              ),
              IconButton(
                icon: const Icon(Icons.filter_list, color: AppColors.textSecondary),
                onPressed: () {},
              ),
            ],
          ),
        ),
      ),
      body: _InboxBody(inbox: inbox),
      floatingActionButton: FloatingActionButton(
        onPressed: () => context.push('/compose'),
        backgroundColor: AppColors.accent,
        child: const Icon(Icons.edit_outlined, color: AppColors.background),
      ),
      bottomNavigationBar: const WmBottomNav(currentIndex: 0),
    );
  }
}

class _InboxBody extends ConsumerWidget {
  const _InboxBody({required this.inbox});
  final InboxState inbox;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (inbox.isLoading && !inbox.hasLoaded) {
      return const Center(
        child: SizedBox(
          width: 24,
          height: 24,
          child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.accent),
        ),
      );
    }

    if (inbox.errorMessage != null && inbox.emails.isEmpty) {
      return _ErrorState(
        message: inbox.errorMessage!,
        onRetry: () => ref.read(inboxControllerProvider.notifier).refresh(),
      );
    }

    if (inbox.emails.isEmpty) {
      return const _EmptyState();
    }

    return RefreshIndicator(
      color: AppColors.accent,
      backgroundColor: AppColors.surface,
      onRefresh: () => ref.read(inboxControllerProvider.notifier).refresh(),
      child: ListView.separated(
        physics: const AlwaysScrollableScrollPhysics(),
        itemCount: inbox.emails.length,
        separatorBuilder: (context, index) =>
            const Divider(height: 1, color: AppColors.border),
        itemBuilder: (context, index) =>
            EmailListItem(email: inbox.emails[index]),
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
            const Icon(Icons.inbox_outlined, color: AppColors.textTertiary, size: 48),
            const SizedBox(height: 16),
            Text(
              'Your inbox is empty',
              style: GoogleFonts.inter(
                fontSize: 16,
                fontWeight: FontWeight.w600,
                color: AppColors.textPrimary,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              'New emails will appear here.',
              style: GoogleFonts.inter(fontSize: 13, color: AppColors.textSecondary),
            ),
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
            const Icon(Icons.error_outline, color: AppColors.badgeRed, size: 40),
            const SizedBox(height: 16),
            Text(
              message,
              textAlign: TextAlign.center,
              style: GoogleFonts.inter(fontSize: 14, color: AppColors.textSecondary),
            ),
            const SizedBox(height: 16),
            TextButton(
              onPressed: onRetry,
              child: Text(
                'Try again',
                style: GoogleFonts.inter(color: AppColors.accent, fontWeight: FontWeight.w600),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
