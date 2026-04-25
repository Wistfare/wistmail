import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../../../core/messaging/root_messenger.dart';
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
              icon: Icons.schedule,
              onPressed: () async {
                final until = await _pickSnoozeTime(context);
                if (until == null || !context.mounted) return;
                final messenger = ScaffoldMessenger.of(context);
                try {
                  final repo = await ref.read(mailRepositoryProvider.future);
                  await repo.snooze(email.id, until);
                  ref
                      .read(inboxControllerProvider.notifier)
                      .removeLocal(email.id);
                } catch (err) {
                  messenger.showSnackBar(
                    SnackBar(
                      content: Text('Snooze failed: $err'),
                      backgroundColor: AppColors.danger,
                    ),
                  );
                  return;
                }
                showRootSnackBar(
                  SnackBar(
                    content: Text('Snoozed until ${_snoozeLabel(until)}.'),
                    duration: const Duration(seconds: 6),
                    action: SnackBarAction(
                      label: 'UNDO',
                      textColor: AppColors.accent,
                      onPressed: () async {
                        try {
                          final r = await ref.read(
                            mailRepositoryProvider.future,
                          );
                          await r.snooze(email.id, null);
                          ref.read(inboxControllerProvider.notifier).refresh();
                        } catch (_) {}
                      },
                    ),
                  ),
                );
                if (context.mounted) context.pop();
              },
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
                // Root-messenger SnackBar so the UNDO survives the
                // route pop below. Route-local messenger would die
                // with the detail scaffold.
                showRootSnackBar(
                  SnackBar(
                    content: const Text('Archived.'),
                    duration: const Duration(seconds: 6),
                    action: SnackBarAction(
                      label: 'UNDO',
                      textColor: AppColors.accent,
                      onPressed: () async {
                        try {
                          final r = await ref.read(
                            mailRepositoryProvider.future,
                          );
                          // Send it back to inbox — we don't track
                          // the source folder, but archiving from
                          // anywhere else is uncommon and the user
                          // can re-file if needed.
                          await r.batchAction(
                            ids: [email.id],
                            action: 'move',
                            folder: 'inbox',
                          );
                          ref.read(inboxControllerProvider.notifier).refresh();
                        } catch (_) {
                          showRootSnackBar(
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
                showRootSnackBar(
                  SnackBar(
                    content: const Text('Moved to Trash.'),
                    duration: const Duration(seconds: 6),
                    action: SnackBarAction(
                      label: 'UNDO',
                      textColor: AppColors.accent,
                      onPressed: () async {
                        try {
                          final r = await ref.read(
                            mailRepositoryProvider.future,
                          );
                          await r.batchAction(
                            ids: [email.id],
                            action: 'move',
                            folder: 'inbox',
                          );
                          ref.read(inboxControllerProvider.notifier).refresh();
                        } catch (_) {
                          showRootSnackBar(
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
              ref
                  .read(inboxControllerProvider.notifier)
                  .applyLocal(email.copyWith(isStarred: starred));
            }
            ref.invalidate(emailDetailProvider(email.id));
          },
        ),
        loading: () => const Center(
          child: SizedBox(
            width: 22,
            height: 22,
            child: CircularProgressIndicator(
              strokeWidth: 2,
              color: AppColors.accent,
            ),
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
          _ThreadStrip(anchorId: email.id),
          const SizedBox(height: 20),
          // HTML body rendered in a sandboxed in-process WebView so
          // newsletter layouts paint faithfully; cid: attachments and
          // remote-image privacy are handled inside EmailBody. Falls
          // back to a native text widget for plain-text emails.
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

/// Bottom sheet of snooze presets. Each computes its target at
/// render time so "Tomorrow morning" is relative to the user's
/// wall clock, not the server's UTC.
Future<DateTime?> _pickSnoozeTime(BuildContext context) async {
  final now = DateTime.now();
  final laterToday = DateTime(
    now.year,
    now.month,
    now.day,
    now.hour,
  ).add(const Duration(hours: 3));
  final tomorrowMorning = DateTime(now.year, now.month, now.day + 1, 8);
  final daysUntilSat = now.weekday == DateTime.saturday
      ? 7
      : (DateTime.saturday - now.weekday + 7) % 7 == 0
      ? 7
      : (DateTime.saturday - now.weekday + 7) % 7;
  final thisWeekend = DateTime(now.year, now.month, now.day + daysUntilSat, 9);
  final nextWeek = DateTime(now.year, now.month, now.day + 7, 8);
  final presets = <({String label, String hint, DateTime at})>[
    (label: 'Later today', hint: _snoozeLabel(laterToday), at: laterToday),
    (
      label: 'Tomorrow',
      hint: _snoozeLabel(tomorrowMorning),
      at: tomorrowMorning,
    ),
    (label: 'This weekend', hint: _snoozeLabel(thisWeekend), at: thisWeekend),
    (label: 'Next week', hint: _snoozeLabel(nextWeek), at: nextWeek),
  ];
  return showModalBottomSheet<DateTime>(
    context: context,
    backgroundColor: AppColors.surface,
    shape: const RoundedRectangleBorder(),
    builder: (ctx) => SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const SizedBox(height: 8),
          Container(width: 36, height: 4, color: AppColors.border),
          const SizedBox(height: 8),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 4, 20, 12),
            child: Align(
              alignment: Alignment.centerLeft,
              child: Text(
                'SNOOZE UNTIL',
                style: GoogleFonts.jetBrainsMono(
                  fontSize: 10,
                  fontWeight: FontWeight.w700,
                  color: AppColors.textMuted,
                  letterSpacing: 0.5,
                ),
              ),
            ),
          ),
          for (final p in presets)
            ListTile(
              leading: const Icon(
                Icons.access_time,
                color: AppColors.textPrimary,
              ),
              title: Text(
                p.label,
                style: GoogleFonts.inter(
                  fontSize: 14,
                  color: AppColors.textPrimary,
                ),
              ),
              trailing: Text(
                p.hint,
                style: GoogleFonts.jetBrainsMono(
                  fontSize: 11,
                  color: AppColors.textMuted,
                ),
              ),
              onTap: () => Navigator.pop(ctx, p.at),
            ),
          const SizedBox(height: 8),
        ],
      ),
    ),
  );
}

String _snoozeLabel(DateTime dt) {
  final local = dt.toLocal();
  // "Fri 8:00 AM" style — short and readable.
  const daysOfWeek = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  final dow = daysOfWeek[local.weekday - 1];
  final hour = local.hour == 0
      ? 12
      : local.hour > 12
      ? local.hour - 12
      : local.hour;
  final ampm = local.hour < 12 ? 'AM' : 'PM';
  final minute = local.minute.toString().padLeft(2, '0');
  return '$dow $hour:$minute $ampm';
}

/// Compact list of sibling messages in the same thread. Renders
/// nothing when the thread has one message (the common case), so
/// the detail view stays clean for standalone emails. Tapping a
/// row routes to that message's detail. Anchor is highlighted.
class _ThreadStrip extends ConsumerStatefulWidget {
  const _ThreadStrip({required this.anchorId});
  final String anchorId;

  @override
  ConsumerState<_ThreadStrip> createState() => _ThreadStripState();
}

class _ThreadStripState extends ConsumerState<_ThreadStrip> {
  List<Map<String, dynamic>>? _messages;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void didUpdateWidget(covariant _ThreadStrip old) {
    super.didUpdateWidget(old);
    if (old.anchorId != widget.anchorId) {
      setState(() {
        _messages = null;
        _loading = true;
      });
      _load();
    }
  }

  Future<void> _load() async {
    try {
      final repo = await ref.read(mailRepositoryProvider.future);
      final msgs = await repo.getThread(widget.anchorId);
      if (!mounted) return;
      setState(() {
        _messages = msgs;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _messages = const [];
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const SizedBox.shrink();
    final msgs = _messages ?? const [];
    if (msgs.length <= 1) return const SizedBox.shrink();
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.surface,
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'THREAD · ${msgs.length} MESSAGES',
            style: GoogleFonts.jetBrainsMono(
              fontSize: 10,
              fontWeight: FontWeight.w700,
              color: AppColors.textMuted,
              letterSpacing: 0.5,
            ),
          ),
          const SizedBox(height: 8),
          for (final m in msgs) _ThreadRow(msg: m, anchorId: widget.anchorId),
        ],
      ),
    );
  }
}

class _ThreadRow extends StatelessWidget {
  const _ThreadRow({required this.msg, required this.anchorId});
  final Map<String, dynamic> msg;
  final String anchorId;

  @override
  Widget build(BuildContext context) {
    final id = msg['id'] as String;
    final isAnchor = id == anchorId;
    final isRead = (msg['isRead'] as bool?) ?? true;
    return InkWell(
      onTap: isAnchor
          ? null
          : () {
              // Replace route so the back gesture pops the whole
              // thread rather than bouncing through every message.
              context.replace('/email/$id');
            },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 6),
        decoration: BoxDecoration(
          color: isAnchor ? AppColors.accentDim : Colors.transparent,
          border: isAnchor
              ? Border.all(color: AppColors.accent.withValues(alpha: 0.4))
              : null,
        ),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    (msg['fromAddress'] as String?) ?? '',
                    style: GoogleFonts.inter(
                      fontSize: 12,
                      fontWeight: !isRead ? FontWeight.w700 : FontWeight.w500,
                      color: AppColors.textPrimary,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 2),
                  Text(
                    (msg['snippet'] as String?) ?? '',
                    style: GoogleFonts.inter(
                      fontSize: 11,
                      color: AppColors.textMuted,
                      height: 1.3,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Text(
              _shortDate(msg['createdAt'] as String?),
              style: GoogleFonts.jetBrainsMono(
                fontSize: 10,
                color: AppColors.textMuted,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

String _shortDate(String? iso) {
  if (iso == null) return '';
  final dt = DateTime.tryParse(iso)?.toLocal();
  if (dt == null) return '';
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  return '${months[dt.month - 1]} ${dt.day}';
}
