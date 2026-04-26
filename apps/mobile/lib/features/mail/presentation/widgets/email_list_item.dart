import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../../../core/messaging/root_messenger.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../../core/widgets/wm_tag.dart';
import '../../data/mail_actions.dart';
import '../../domain/email.dart';
import '../providers/mail_providers.dart';
import 'attachments_strip.dart';

/// Mobile/Inbox row — sharp, full-width, separated by 1px hairlines.
///
/// Two interaction modes:
///   • Default: tap → open detail, long-press → enter selection mode
///     with this row marked.
///   • Selection mode (selection set non-empty): tap → toggle this
///     row's membership, long-press is a no-op.
class EmailListItem extends ConsumerWidget {
  const EmailListItem({super.key, required this.email});

  final Email email;

  void _toggle(WidgetRef ref) {
    final current = ref.read(selectedEmailIdsProvider);
    final next = Set<String>.from(current);
    if (next.contains(email.id)) {
      next.remove(email.id);
    } else {
      next.add(email.id);
    }
    ref.read(selectedEmailIdsProvider.notifier).state = next;
  }

  /// Fire-and-forget archive that matches the outbox / optimistic
  /// behaviour of the detail-screen action. Used by the swipe
  /// gesture when the Dismissible commits.
  Future<void> _swipeArchive(WidgetRef ref) async {
    final actions = ref.read(mailActionsProvider).valueOrNull;
    if (actions != null) {
      await actions.archive(email);
    } else {
      final repo = await ref.read(mailRepositoryProvider.future);
      await repo.archive(email.id);
      ref.read(inboxControllerProvider.notifier).removeLocal(email.id);
    }
    showRootSnackBar(
      SnackBar(
        content: const Text('Archived.'),
        duration: const Duration(seconds: 6),
        action: SnackBarAction(
          label: 'UNDO',
          textColor: AppColors.accent,
          onPressed: () async {
            try {
              final r = await ref.read(mailRepositoryProvider.future);
              await r.batchAction(
                ids: [email.id],
                action: 'move',
                folder: 'inbox',
              );
              ref.read(inboxControllerProvider.notifier).refresh();
            } catch (_) {}
          },
        ),
      ),
    );
  }

  Future<void> _swipeDelete(WidgetRef ref) async {
    final actions = ref.read(mailActionsProvider).valueOrNull;
    if (actions != null) {
      await actions.delete(email);
    } else {
      final repo = await ref.read(mailRepositoryProvider.future);
      await repo.delete(email.id);
      ref.read(inboxControllerProvider.notifier).removeLocal(email.id);
    }
    showRootSnackBar(
      SnackBar(
        content: const Text('Moved to Trash.'),
        duration: const Duration(seconds: 6),
        action: SnackBarAction(
          label: 'UNDO',
          textColor: AppColors.accent,
          onPressed: () async {
            try {
              final r = await ref.read(mailRepositoryProvider.future);
              await r.batchAction(
                ids: [email.id],
                action: 'move',
                folder: 'inbox',
              );
              ref.read(inboxControllerProvider.notifier).refresh();
            } catch (_) {}
          },
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final unread = !email.isRead;
    final selection = ref.watch(selectedEmailIdsProvider);
    final inSelectionMode = selection.isNotEmpty;
    final isSelected = selection.contains(email.id);
    final folder = ref.watch(currentFolderProvider);
    // Swipe actions are suppressed in selection mode (tap toggles
    // instead) and in Trash (the row is already trashed; swiping
    // to delete again would be confusing). Otherwise:
    //   • Swipe right (startToEnd) → archive.
    //   • Swipe left (endToStart)  → delete (soft → trash).
    final swipeEnabled = !inSelectionMode && folder.id != 'trash';

    final rowContent = Material(
      color: isSelected ? AppColors.accentDim : Colors.transparent,
      child: InkWell(
        onTap: () {
          if (inSelectionMode) {
            _toggle(ref);
          } else {
            context.push('/email/${email.id}');
          }
        },
        onLongPress: () {
          // Selection entry point. Light haptic so the mode change is
          // felt as well as seen; otherwise users fat-finger into
          // selection mode without realising.
          HapticFeedback.selectionClick();
          _toggle(ref);
        },
        splashColor: AppColors.surface,
        highlightColor: AppColors.surface.withValues(alpha: 0.6),
        child: Container(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  // Selection affordance — replaces the unread dot
                  // slot so rows don't get wider in selection mode.
                  SizedBox(
                    width: 10,
                    child: inSelectionMode
                        ? Icon(
                            isSelected
                                ? Icons.check_box
                                : Icons.check_box_outline_blank,
                            size: 14,
                            color: isSelected
                                ? AppColors.accent
                                : AppColors.textMuted,
                          )
                        : (unread
                            ? Container(
                                width: 7,
                                height: 7,
                                decoration: const BoxDecoration(
                                  color: AppColors.accent,
                                  shape: BoxShape.circle,
                                ),
                              )
                            : null),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      email.senderName,
                      style: GoogleFonts.inter(
                        fontSize: 14,
                        fontWeight: unread ? FontWeight.w700 : FontWeight.w500,
                        color: unread
                            ? AppColors.textPrimary
                            : AppColors.textSecondary,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  if (email.hasAttachments) ...[
                    const AttachmentBadge(count: 1),
                    const SizedBox(width: 6),
                  ],
                  // Lifecycle pill — shows nothing for normal inbound /
                  // sent rows; flips to "Sending" / "Queued" / "Failed"
                  // when the user has tried to send.
                  if (_SendStatusPill.shouldShow(email.status)) ...[
                    _SendStatusPill(status: email.status),
                    const SizedBox(width: 6),
                  ],
                  Text(email.timeAgo, style: AppTextStyles.meta),
                ],
              ),
              const SizedBox(height: 4),
              Padding(
                padding: const EdgeInsets.only(left: 18),
                child: Text(
                  email.subject.isEmpty ? '(no subject)' : email.subject,
                  style: GoogleFonts.inter(
                    fontSize: 13,
                    fontWeight: unread ? FontWeight.w600 : FontWeight.w400,
                    color: unread
                        ? AppColors.textPrimary
                        : AppColors.textSecondary,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              if (email.preview.isNotEmpty) ...[
                const SizedBox(height: 4),
                Padding(
                  padding: const EdgeInsets.only(left: 18),
                  child: Text(
                    email.preview,
                    style: GoogleFonts.inter(
                      fontSize: 12,
                      color: AppColors.textTertiary,
                      height: 1.45,
                    ),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
              // Labels ship inline in the list response (the backend
              // joins email_labels in `EmailService.list`), so this is
              // a render of the already-parsed array — no per-row
              // fetch. Auto-applied AI labels (source='ai') flow
              // through the same array as user-defined ones.
              _RowLabels(labels: email.labels),
            ],
          ),
        ),
      ),
    );

    if (!swipeEnabled) return rowContent;

    return Dismissible(
      key: ValueKey('swipe-${email.id}'),
      // confirmDismiss fires the action; we never actually let the
      // row stay dismissed because the inbox controller's state
      // already dropped the row via removeLocal. Returning false
      // keeps Flutter's animation tidy and avoids a brief flicker
      // before the controller rebuild completes.
      background: _swipeBg(
        align: Alignment.centerLeft,
        color: AppColors.accent,
        icon: Icons.archive_outlined,
        label: 'Archive',
      ),
      secondaryBackground: _swipeBg(
        align: Alignment.centerRight,
        color: AppColors.danger,
        icon: Icons.delete_outline,
        label: 'Delete',
      ),
      // A full drag to fire — matches iOS Mail behaviour where
      // partial swipes don't commit. Also avoids accidental archives
      // when the user's just trying to scroll horizontally.
      dismissThresholds: const {
        DismissDirection.startToEnd: 0.4,
        DismissDirection.endToStart: 0.4,
      },
      confirmDismiss: (direction) async {
        if (direction == DismissDirection.startToEnd) {
          await _swipeArchive(ref);
        } else {
          await _swipeDelete(ref);
        }
        // We return true so Dismissible animates the row off-screen
        // cleanly; the controller's removeLocal keeps it from
        // reappearing on the next rebuild.
        return true;
      },
      child: rowContent,
    );
  }

  /// Colour + icon + label block rendered behind the row as the user
  /// drags. We show both so even a short drag signals which action
  /// is about to commit.
  Widget _swipeBg({
    required AlignmentGeometry align,
    required Color color,
    required IconData icon,
    required String label,
  }) {
    return Container(
      color: color.withValues(alpha: 0.25),
      alignment: align,
      padding: const EdgeInsets.symmetric(horizontal: 24),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 20, color: color),
          const SizedBox(width: 8),
          Text(
            label.toUpperCase(),
            style: GoogleFonts.jetBrainsMono(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: color,
              letterSpacing: 0.5,
            ),
          ),
        ],
      ),
    );
  }
}

/// Inline labels strip rendered under the row preview. Empty +
/// collapsed when the email has no labels (the common case) so
/// untagged rows aren't visually heavier than they were before.
/// Labels come baked into the list response — no per-row network
/// fetch — which is why this doesn't need ref/providers anymore.
class _RowLabels extends StatelessWidget {
  const _RowLabels({required this.labels});
  final List<EmailLabelRef> labels;

  @override
  Widget build(BuildContext context) {
    if (labels.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(left: 18, top: 6),
      child: Wrap(
        spacing: 6,
        runSpacing: 4,
        children: [
          for (final l in labels) WmTag(label: l.name, color: l.swatch),
        ],
      ),
    );
  }
}

/// Tiny status pill rendered next to the timestamp. Hidden for
/// 'idle'/'sent' so received mail rows stay clean.
class _SendStatusPill extends StatelessWidget {
  const _SendStatusPill({required this.status});

  final String status;

  static bool shouldShow(String status) =>
      status == 'sending' || status == 'rate_limited' || status == 'failed';

  @override
  Widget build(BuildContext context) {
    late final Color bg;
    late final Color fg;
    late final String label;
    late final IconData icon;
    switch (status) {
      case 'sending':
        bg = AppColors.accent.withValues(alpha: 0.15);
        fg = AppColors.accent;
        label = 'Sending';
        icon = Icons.sync;
      case 'rate_limited':
        bg = AppColors.tagDigest.withValues(alpha: 0.15);
        fg = AppColors.tagDigest;
        label = 'Queued';
        icon = Icons.schedule;
      case 'failed':
      default:
        bg = AppColors.danger.withValues(alpha: 0.15);
        fg = AppColors.danger;
        label = 'Failed';
        icon = Icons.error_outline;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(color: bg),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 10, color: fg),
          const SizedBox(width: 4),
          Text(
            label,
            style: GoogleFonts.jetBrainsMono(
              fontSize: 9,
              fontWeight: FontWeight.w700,
              color: fg,
              height: 1.1,
            ),
          ),
        ],
      ),
    );
  }
}
