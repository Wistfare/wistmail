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
    final folder = ref.watch(currentFolderProvider);
    final selection = ref.watch(selectedEmailIdsProvider);
    final inSelectionMode = selection.isNotEmpty;

    // Auth gating happens in the router's redirect — no listener needed here.

    // Drawer lives on the MainShell scaffold so it overlays the bottom
    // nav and the scrim covers the entire screen. The hamburger button
    // walks up to that scaffold via Scaffold.of with the root context.
    return Scaffold(
      backgroundColor: AppColors.background,
      body: Column(
        children: [
          if (inSelectionMode)
            _SelectionBar(folder: folder)
          else
            _TopBar(unreadCount: unreadCount),
          if (showMfaBanner && !inSelectionMode) const _MfaBanner(),
          if ((folder.id == 'trash' || folder.id == 'spam') && !inSelectionMode)
            _CleanupBanner(folderId: folder.id),
          if (!inSelectionMode) _FilterBar(folder: folder),
          Expanded(child: _InboxBody(inbox: inbox)),
        ],
      ),
      floatingActionButton: inSelectionMode
          ? null
          : Padding(
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

class _TopBar extends ConsumerWidget {
  const _TopBar({required this.unreadCount});
  final int unreadCount;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Title tracks the active folder so users always know which view
    // they're looking at after picking from the drawer.
    final folder = ref.watch(currentFolderProvider);
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
            Text(folder.label, style: AppTextStyles.titleLarge),
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

/// Replaces the normal top bar when the user has selected one or
/// more rows. Exposes bulk actions (mark read/unread, archive,
/// delete) alongside a selection count and an X to bail out. We
/// deliberately keep the set of verbs small — more exotic actions
/// (move-to-folder, bulk label) need secondary pickers and would
/// make this bar visually noisy; they'll land in a "more" sheet
/// later.
class _SelectionBar extends ConsumerWidget {
  const _SelectionBar({required this.folder});
  final InboxFolder folder;

  Future<void> _runBulk(
    WidgetRef ref,
    BuildContext context,
    String action,
  ) async {
    final ids = ref.read(selectedEmailIdsProvider).toList();
    if (ids.isEmpty) return;
    // Empty the selection immediately so the UI reflects the user's
    // intent before the network call returns.
    ref.read(selectedEmailIdsProvider.notifier).state = const <String>{};
    final messenger = ScaffoldMessenger.of(context);
    try {
      final repo = await ref.read(mailRepositoryProvider.future);
      // Single round-trip via the batch endpoint — the server
      // enforces the auth filter and runs the whole set in one
      // statement.
      await repo.batchAction(ids: ids, action: action);
      ref.read(inboxControllerProvider.notifier).refresh();

      // Undo toast — only for reversible actions. Purge is permanent
      // so we just surface a confirmation without an action button.
      final count = ids.length;
      final plural = count == 1 ? '' : 's';
      String message;
      String? undoAction;
      String? undoFolder;
      switch (action) {
        case 'read':
          message = 'Marked $count as read.';
          undoAction = 'unread';
        case 'unread':
          message = 'Marked $count as unread.';
          undoAction = 'read';
        case 'archive':
          message = 'Archived $count email$plural.';
          undoAction = 'move';
          undoFolder = 'inbox';
        case 'delete':
          message = 'Moved $count email$plural to Trash.';
          undoAction = 'move';
          undoFolder = 'inbox';
        case 'purge':
          message = 'Permanently deleted $count email$plural.';
        default:
          // Unknown action shouldn't reach here — the selection bar
          // only fires the cases above — but give the analyzer a
          // definite assignment so the Text arg is non-nullable.
          message = 'Done.';
      }
      messenger.hideCurrentSnackBar();
      messenger.showSnackBar(
        SnackBar(
          content: Text(message),
          duration: const Duration(seconds: 6),
          action: undoAction == null
              ? null
              : SnackBarAction(
                  label: 'UNDO',
                  textColor: AppColors.accent,
                  onPressed: () async {
                    try {
                      final r = await ref.read(mailRepositoryProvider.future);
                      await r.batchAction(
                        ids: ids,
                        action: undoAction!,
                        folder: undoFolder,
                      );
                      ref.read(inboxControllerProvider.notifier).refresh();
                    } catch (_) {
                      // Undo failed — the visible original toast is
                      // already dismissed by the snackbar action tap,
                      // so surface the failure cleanly.
                      messenger.showSnackBar(
                        const SnackBar(
                          content: Text('Undo failed.'),
                          backgroundColor: AppColors.danger,
                        ),
                      );
                    }
                  },
                ),
        ),
      );
    } catch (err) {
      messenger.showSnackBar(
        SnackBar(
          content: Text('Bulk action failed: $err'),
          backgroundColor: AppColors.danger,
        ),
      );
    }
  }

  Future<void> _confirmBulkPurge(
    WidgetRef ref,
    BuildContext context,
  ) async {
    final count = ref.read(selectedEmailIdsProvider).length;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.surface,
        title: Text(
          'Delete $count forever?',
          style: const TextStyle(
            color: AppColors.textPrimary,
            fontWeight: FontWeight.w700,
          ),
        ),
        content: const Text(
          'This bypasses the recovery window and cannot be undone.',
          style: TextStyle(color: AppColors.textSecondary),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('CANCEL'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text(
              'DELETE FOREVER',
              style: TextStyle(color: AppColors.danger),
            ),
          ),
        ],
      ),
    );
    if (ok == true && context.mounted) {
      await _runBulk(ref, context, 'purge');
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final count = ref.watch(selectedEmailIdsProvider).length;
    final inTrash = folder.id == 'trash';
    return SafeArea(
      bottom: false,
      child: Container(
        color: AppColors.accentDim,
        padding: const EdgeInsets.fromLTRB(8, 6, 8, 6),
        child: Row(
          children: [
            IconButton(
              icon: const Icon(Icons.close, color: AppColors.textPrimary),
              onPressed: () {
                ref.read(selectedEmailIdsProvider.notifier).state =
                    const <String>{};
              },
            ),
            Text(
              '$count selected',
              style: GoogleFonts.inter(
                fontSize: 15,
                fontWeight: FontWeight.w700,
                color: AppColors.textPrimary,
              ),
            ),
            const Spacer(),
            IconButton(
              tooltip: 'Mark read',
              icon: const Icon(Icons.mark_email_read_outlined,
                  color: AppColors.textPrimary),
              onPressed: () => _runBulk(ref, context, 'read'),
            ),
            IconButton(
              tooltip: 'Mark unread',
              icon: const Icon(Icons.mark_email_unread_outlined,
                  color: AppColors.textPrimary),
              onPressed: () => _runBulk(ref, context, 'unread'),
            ),
            if (!inTrash && folder.id != 'archive')
              IconButton(
                tooltip: 'Archive',
                icon: const Icon(Icons.archive_outlined,
                    color: AppColors.textPrimary),
                onPressed: () => _runBulk(ref, context, 'archive'),
              ),
            if (inTrash)
              IconButton(
                tooltip: 'Delete forever',
                icon: const Icon(Icons.delete_forever_outlined,
                    color: AppColors.danger),
                onPressed: () => _confirmBulkPurge(ref, context),
              )
            else
              IconButton(
                tooltip: 'Delete',
                icon: const Icon(Icons.delete_outline,
                    color: AppColors.textPrimary),
                onPressed: () => _runBulk(ref, context, 'delete'),
              ),
          ],
        ),
      ),
    );
  }
}

/// Banner rendered above Trash or Spam — both folders auto-purge, so
/// they get the same "auto-deletes after N days + EMPTY now"
/// treatment. Folder id drives the wording and the API call; the
/// rest of the chrome is identical.
class _CleanupBanner extends ConsumerStatefulWidget {
  const _CleanupBanner({required this.folderId});
  final String folderId;

  @override
  ConsumerState<_CleanupBanner> createState() => _CleanupBannerState();
}

class _CleanupBannerState extends ConsumerState<_CleanupBanner> {
  int _retentionDays = 30;
  bool _loading = true;
  bool _emptying = false;

  String get _folderLabel =>
      widget.folderId == 'spam' ? 'Spam' : 'Trash';

  @override
  void initState() {
    super.initState();
    _loadRetention();
  }

  @override
  void didUpdateWidget(covariant _CleanupBanner old) {
    super.didUpdateWidget(old);
    if (old.folderId != widget.folderId) {
      setState(() => _loading = true);
      _loadRetention();
    }
  }

  Future<void> _loadRetention() async {
    try {
      final repo = await ref.read(mailRepositoryProvider.future);
      final days = await repo.getFolderRetention(widget.folderId);
      if (!mounted) return;
      setState(() {
        _retentionDays = days;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _loading = false);
    }
  }

  Future<void> _empty() async {
    if (_emptying) return;
    final messenger = ScaffoldMessenger.of(context);
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.surface,
        title: Text(
          'Empty $_folderLabel?',
          style: const TextStyle(
            color: AppColors.textPrimary,
            fontWeight: FontWeight.w700,
          ),
        ),
        content: Text(
          'Permanently delete everything in $_folderLabel. This bypasses the recovery window and cannot be undone.',
          style: const TextStyle(color: AppColors.textSecondary),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('CANCEL'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(
              'EMPTY ${_folderLabel.toUpperCase()}',
              style: const TextStyle(color: AppColors.danger),
            ),
          ),
        ],
      ),
    );
    if (confirm != true) return;
    setState(() => _emptying = true);
    try {
      final repo = await ref.read(mailRepositoryProvider.future);
      final result = await repo.emptyFolder(widget.folderId);
      if (!mounted) return;
      ref.read(inboxControllerProvider.notifier).refresh();
      final n = result['purgedEmails'] ?? 0;
      messenger.showSnackBar(
        SnackBar(
          content: Text(
            n == 0
                ? '$_folderLabel was already empty.'
                : 'Deleted $n email${n == 1 ? '' : 's'}.',
          ),
        ),
      );
    } catch (err) {
      if (!mounted) return;
      messenger.showSnackBar(
        SnackBar(
          content: Text('Empty ${_folderLabel.toLowerCase()} failed: $err'),
          backgroundColor: AppColors.danger,
        ),
      );
    } finally {
      if (mounted) setState(() => _emptying = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      color: AppColors.surface,
      padding: const EdgeInsets.fromLTRB(20, 10, 12, 10),
      decoration: const BoxDecoration(
        border: Border(
          bottom: BorderSide(color: AppColors.border, width: 1),
        ),
      ),
      child: Row(
        children: [
          const Icon(Icons.schedule, size: 14, color: AppColors.textMuted),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              _loading
                  ? '$_folderLabel auto-cleans regularly.'
                  : 'Auto-deletes after $_retentionDays days.',
              style: GoogleFonts.jetBrainsMono(
                fontSize: 11,
                color: AppColors.textSecondary,
              ),
            ),
          ),
          TextButton.icon(
            onPressed: _emptying ? null : _empty,
            icon: _emptying
                ? const SizedBox(
                    height: 12,
                    width: 12,
                    child: CircularProgressIndicator(
                      strokeWidth: 1.5,
                      valueColor: AlwaysStoppedAnimation(AppColors.danger),
                    ),
                  )
                : const Icon(Icons.delete_forever_outlined,
                    size: 14, color: AppColors.danger),
            label: Text(
              _emptying ? 'Emptying…' : 'EMPTY',
              style: GoogleFonts.jetBrainsMono(
                fontSize: 11,
                fontWeight: FontWeight.w700,
                color: AppColors.danger,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Chip row + trailing "Mark all read" action that sits between the
/// top bar and the email list. Filters are client-side — they narrow
/// whatever rows the controller has already loaded — so flipping
/// between All / Unread / Starred / Has files is instant.
class _FilterBar extends ConsumerWidget {
  const _FilterBar({required this.folder});
  final InboxFolder folder;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final filter = ref.watch(inboxFilterProvider);
    final state = ref.watch(inboxControllerProvider);
    final hasUnread = state.emails.any((e) => !e.isRead);

    return Container(
      color: AppColors.background,
      padding: const EdgeInsets.fromLTRB(16, 4, 8, 4),
      decoration: const BoxDecoration(
        border: Border(
          bottom: BorderSide(color: AppColors.border, width: 1),
        ),
      ),
      child: Row(
        children: [
          Expanded(
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  _FilterChip(
                    label: 'All',
                    active: filter == InboxFilter.all,
                    onTap: () => ref
                        .read(inboxFilterProvider.notifier)
                        .state = InboxFilter.all,
                  ),
                  _FilterChip(
                    label: 'Unread',
                    active: filter == InboxFilter.unread,
                    onTap: () => ref
                        .read(inboxFilterProvider.notifier)
                        .state = InboxFilter.unread,
                  ),
                  _FilterChip(
                    label: 'Starred',
                    active: filter == InboxFilter.starred,
                    onTap: () => ref
                        .read(inboxFilterProvider.notifier)
                        .state = InboxFilter.starred,
                  ),
                  _FilterChip(
                    label: 'Files',
                    active: filter == InboxFilter.attachments,
                    onTap: () => ref
                        .read(inboxFilterProvider.notifier)
                        .state = InboxFilter.attachments,
                  ),
                ],
              ),
            ),
          ),
          if (hasUnread)
            _MarkAllReadButton(folderId: folder.id),
        ],
      ),
    );
  }
}

class _FilterChip extends StatelessWidget {
  const _FilterChip({
    required this.label,
    required this.active,
    required this.onTap,
  });
  final String label;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(right: 6),
      child: InkWell(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          decoration: BoxDecoration(
            color: active ? AppColors.accentDim : Colors.transparent,
            border: Border.all(
              color: active ? AppColors.accent : AppColors.border,
            ),
          ),
          child: Text(
            label,
            style: GoogleFonts.jetBrainsMono(
              fontSize: 10,
              fontWeight: FontWeight.w700,
              color: active ? AppColors.accent : AppColors.textSecondary,
              letterSpacing: 0.5,
            ),
          ),
        ),
      ),
    );
  }
}

class _MarkAllReadButton extends ConsumerStatefulWidget {
  const _MarkAllReadButton({required this.folderId});
  final String folderId;

  @override
  ConsumerState<_MarkAllReadButton> createState() =>
      _MarkAllReadButtonState();
}

class _MarkAllReadButtonState extends ConsumerState<_MarkAllReadButton> {
  bool _busy = false;

  Future<void> _run() async {
    if (_busy) return;
    setState(() => _busy = true);
    final messenger = ScaffoldMessenger.of(context);
    try {
      final repo = await ref.read(mailRepositoryProvider.future);
      final n = await repo.markAllRead(widget.folderId);
      ref.read(inboxControllerProvider.notifier).refresh();
      if (!mounted) return;
      messenger.hideCurrentSnackBar();
      messenger.showSnackBar(
        SnackBar(
          content: Text(
            n == 0 ? 'Nothing to mark.' : 'Marked $n as read.',
          ),
        ),
      );
    } catch (err) {
      if (!mounted) return;
      messenger.showSnackBar(
        SnackBar(
          content: Text('Mark-all-read failed: $err'),
          backgroundColor: AppColors.danger,
        ),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return TextButton.icon(
      onPressed: _busy ? null : _run,
      icon: _busy
          ? const SizedBox(
              height: 12,
              width: 12,
              child: CircularProgressIndicator(
                strokeWidth: 1.5,
                valueColor: AlwaysStoppedAnimation(AppColors.textSecondary),
              ),
            )
          : const Icon(
              Icons.mark_email_read_outlined,
              size: 14,
              color: AppColors.textSecondary,
            ),
      label: Text(
        _busy ? '…' : 'READ ALL',
        style: GoogleFonts.jetBrainsMono(
          fontSize: 10,
          fontWeight: FontWeight.w700,
          color: AppColors.textSecondary,
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

    final filter = ref.watch(inboxFilterProvider);
    // Client-side filter against the loaded page. Same pattern as
    // web — when the user flips to "Unread" and there's nothing
    // unread on the current page we'll paginate until we have some.
    final visible = inbox.emails.where((e) {
      switch (filter) {
        case InboxFilter.all:
          return true;
        case InboxFilter.unread:
          return !e.isRead;
        case InboxFilter.starred:
          return e.isStarred;
        case InboxFilter.attachments:
          return e.hasAttachments;
      }
    }).toList();

    if (visible.isEmpty) return const _EmptyState();

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
          itemCount: visible.length + (inbox.hasMore ? 1 : 0),
          separatorBuilder: (_, __) =>
              const Divider(height: 1, color: AppColors.border),
          itemBuilder: (context, index) {
            if (index >= visible.length) {
              return const _LoadMoreFooter();
            }
            return EmailListItem(email: visible[index]);
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
