import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../../core/widgets/wm_app_bar.dart';
import '../../../../core/widgets/wm_avatar.dart';
import '../../../../core/widgets/wm_tag.dart';
import '../../../auth/presentation/providers/auth_controller.dart';
import '../../../labels/presentation/providers/labels_providers.dart';
import '../../data/mail_actions.dart';
import '../../domain/compose_args.dart';
import '../../domain/email.dart';
import '../providers/mail_providers.dart';
import '../widgets/attachments_strip.dart';
import '../widgets/email_body.dart';

/// Mobile/EmailDetail — design.lib.pen node `aZAGV`.
class EmailDetailScreen extends ConsumerWidget {
  const EmailDetailScreen({super.key, required this.emailId});

  final String emailId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final emailAsync = ref.watch(emailDetailProvider(emailId));

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: WmAppBar(
        divider: false,
        actions: emailAsync.when(
          data: (email) => [
            _IconAction(
              icon: Icons.reply,
              onPressed: () {
                final me = ref.read(authControllerProvider).user?.email;
                context.push(
                  '/compose',
                  extra: ComposeFromEmail.reply(email, userEmail: me),
                );
              },
            ),
            _IconAction(
              icon: Icons.reply_all,
              onPressed: () {
                final me = ref.read(authControllerProvider).user?.email;
                context.push(
                  '/compose',
                  extra: ComposeFromEmail.replyAll(email, userEmail: me),
                );
              },
            ),
            _IconAction(
              icon: Icons.forward,
              onPressed: () {
                context.push(
                  '/compose',
                  extra: ComposeFromEmail.forward(email),
                );
              },
            ),
            _IconAction(
              icon: Icons.label_outline,
              onPressed: () => context.push('/email/${email.id}/labels'),
            ),
            _IconAction(
              icon: Icons.archive_outlined,
              onPressed: () async {
                // Synchronous read — engine is bootstrapped on app
                // start so this resolves immediately in production.
                // Fallback to direct repo call if not (test env).
                final actions = ref.read(mailActionsProvider).valueOrNull;
                if (actions != null) {
                  unawaited(actions.archive(email));
                } else {
                  final repo = await ref.read(mailRepositoryProvider.future);
                  await repo.archive(email.id);
                  ref
                      .read(inboxControllerProvider.notifier)
                      .removeLocal(email.id);
                }
                if (context.mounted) context.pop();
              },
            ),
            _IconAction(
              icon: Icons.delete_outline,
              // Trash-folder items bypass the soft-delete path: they're
              // already trashed, so another "delete" means permanent.
              // We gate on a confirmation dialog — permanent means
              // attachment bytes get unlinked too.
              onPressed: () async {
                final isAlreadyTrashed = email.folder == 'trash';
                if (isAlreadyTrashed) {
                  final messenger = ScaffoldMessenger.of(context);
                  final navigator = Navigator.of(context);
                  final confirm = await showDialog<bool>(
                    context: context,
                    builder: (ctx) => AlertDialog(
                      backgroundColor: AppColors.surface,
                      title: const Text(
                        'Delete forever?',
                        style: TextStyle(
                          color: AppColors.textPrimary,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      content: const Text(
                        'This bypasses the 30-day recovery window. You cannot undo this.',
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
                  if (confirm != true) return;
                  try {
                    final repo = await ref.read(mailRepositoryProvider.future);
                    await repo.purge(email.id);
                    ref
                        .read(inboxControllerProvider.notifier)
                        .removeLocal(email.id);
                  } catch (err) {
                    messenger.showSnackBar(
                      SnackBar(
                        content: Text('Delete failed: $err'),
                        backgroundColor: AppColors.danger,
                      ),
                    );
                    return;
                  }
                  if (navigator.canPop()) navigator.pop();
                  return;
                }
                final actions = ref.read(mailActionsProvider).valueOrNull;
                if (actions != null) {
                  unawaited(actions.delete(email));
                } else {
                  final repo = await ref.read(mailRepositoryProvider.future);
                  await repo.delete(email.id);
                  ref
                      .read(inboxControllerProvider.notifier)
                      .removeLocal(email.id);
                }
                if (context.mounted) context.pop();
              },
            ),
          ],
          loading: () => const [SizedBox.shrink()],
          error: (_, __) => const [SizedBox.shrink()],
        ),
      ),
      body: emailAsync.when(
        data: (email) => _Body(
          email: email,
          onToggleStar: () async {
            final actions = ref.read(mailActionsProvider).valueOrNull;
            if (actions != null) {
              // Coalesces multiple rapid taps into one HTTP call.
              await actions.toggleStar(email);
            } else {
              final repo = await ref.read(mailRepositoryProvider.future);
              final starred = await repo.toggleStar(email.id);
              ref.read(inboxControllerProvider.notifier).applyLocal(
                    email.copyWith(isStarred: starred),
                  );
            }
            ref.invalidate(emailDetailProvider(email.id));
          },
        ),
        loading: () => const Center(
          child: SizedBox(
            width: 22,
            height: 22,
            child: CircularProgressIndicator(
                strokeWidth: 2, color: AppColors.accent),
          ),
        ),
        error: (err, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Text(err.toString(), style: AppTextStyles.bodySmall),
          ),
        ),
      ),
    );
  }
}

class _IconAction extends StatelessWidget {
  const _IconAction({required this.icon, required this.onPressed});
  final IconData icon;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return IconButton(
      splashRadius: 20,
      icon: Icon(icon, size: 20),
      color: AppColors.textSecondary,
      onPressed: onPressed,
    );
  }
}

class _Body extends ConsumerWidget {
  const _Body({required this.email, required this.onToggleStar});
  final Email email;
  final VoidCallback onToggleStar;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Subject row + star
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Text(
                  email.subject.isEmpty ? '(no subject)' : email.subject,
                  // Sized down from 20 → 16 to match the rest of the
                  // titleLarge family on detail screens; the bigger value
                  // overpowered the tags row right below.
                  style: GoogleFonts.inter(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                    color: AppColors.textPrimary,
                    height: 1.35,
                  ),
                ),
              ),
              IconButton(
                splashRadius: 20,
                onPressed: onToggleStar,
                icon: Icon(
                  email.isStarred ? Icons.star : Icons.star_outline,
                  color: email.isStarred
                      ? AppColors.accent
                      : AppColors.textTertiary,
                  size: 20,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          // Real labels from the API. Falls back to nothing while
          // loading; we never want to flash the keyword-based fakes.
          _LabelsRow(email: email),
          const SizedBox(height: 16),
          const Divider(color: AppColors.border, height: 1),
          const SizedBox(height: 16),
          // Sender row
          Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              WmAvatar(name: email.senderName, size: 36),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      email.senderName,
                      style: GoogleFonts.inter(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: AppColors.textPrimary,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '${email.senderEmail}  ·  ${email.timeAgo}',
                      style: AppTextStyles.monoSmall,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
            ],
          ),
          if (email.toAddresses.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(
              'To: ${email.toAddresses.join(', ')}',
              style: AppTextStyles.monoSmall.copyWith(fontSize: 11),
            ),
          ],
          const SizedBox(height: 20),
          const Divider(color: AppColors.border, height: 1),
          if (email.attachments.isNotEmpty)
            AttachmentsStrip(emailId: email.id, attachments: email.attachments),
          const SizedBox(height: 20),
          // Real HTML rendering — flutter_html with our typography +
          // cid: attachment resolution + remote-image privacy gate.
          // Falls back to formatted text-with-quotes when there's no
          // htmlBody (plain-text emails, e.g. from CLI senders).
          EmailBody(email: email),
        ],
      ),
    );
  }

}

/// Renders the real labels assigned to this email. Empty + collapsed
/// while loading or when nothing is assigned — the previous keyword-
/// based heuristic is gone.
/// Labels strip on the email detail view. Reads straight off the
/// email object rather than firing its own fetch — the
/// /inbox/emails/:id response already bakes in `labels` the same way
/// the list response does. Kept here as a dedicated widget because
/// the detail screen invalidates `labelsForEmailProvider` on the
/// label-assign flow; when that happens we re-watch and re-render.
class _LabelsRow extends ConsumerWidget {
  const _LabelsRow({required this.email});
  final Email email;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // After a label-assign edit we invalidate the per-email label
    // provider; watching it here means we pick up the fresh labels
    // without needing a separate in-memory subscription.
    final freshLabels = ref.watch(labelsForEmailProvider(email.id));
    final list = freshLabels.maybeWhen(
      data: (rows) => rows
          .map((l) => EmailLabelRef(id: l.id, name: l.name, color: l.color))
          .toList(),
      orElse: () => email.labels,
    );
    if (list.isEmpty) return const SizedBox.shrink();
    return Wrap(
      spacing: 6,
      runSpacing: 6,
      children: [for (final l in list) WmTag(label: l.name, color: l.swatch)],
    );
  }
}
