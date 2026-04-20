import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../../core/widgets/wm_tag.dart';
import '../../domain/email.dart';
import 'attachments_strip.dart';

/// Mobile/Inbox row — sharp, full-width, separated by 1px hairlines.
class EmailListItem extends ConsumerWidget {
  const EmailListItem({super.key, required this.email});

  final Email email;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final unread = !email.isRead;
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: () => context.push('/email/${email.id}'),
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
                  SizedBox(
                    width: 10,
                    child: unread
                        ? Container(
                            width: 7,
                            height: 7,
                            decoration: const BoxDecoration(
                              color: AppColors.accent,
                              shape: BoxShape.circle,
                            ),
                          )
                        : null,
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
              // Real labels — fetched on demand from /labels/email/:id.
              // The autoDispose family caches per-email, so scrolling
              // back to a row reuses the result instead of refetching.
              _RowLabels(labels: email.labels),
            ],
          ),
        ),
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
