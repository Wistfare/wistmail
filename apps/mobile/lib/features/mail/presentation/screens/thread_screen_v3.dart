import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../../core/messaging/root_messenger.dart';
import '../../../../core/network/providers.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../auth/presentation/providers/auth_controller.dart';
import '../../domain/compose_args.dart';
import '../../domain/email.dart';
import '../providers/mail_providers.dart';
import '../widgets/email_body.dart';
import '../widgets/meeting_extraction_chip.dart';
import '../widgets/reply_suggestion_strip.dart';

/// MobileV3 Thread (email detail) — pen node `NoPsV`.
///
/// Structure:
///   - tTop (padding [8,12], space_between): back btn (40×40 circle
///     wm-surface, arrow-left 18 primary), center group (gap 8) "FOLDER"
///     10/700 secondary letterSpacing 1.5 · "N of M" 10/600 primary,
///     4 action btns gap 6 (each 40×40 circle wm-surface 18 primary):
///     reply, reply-all, forward, ellipsis-vertical.
///   - tSubj (padding [8,20,14,20], gap 10 vertical): label chips row
///     (cornerRadius 6, padding [3,8], 9/700 letterSpacing 1) + subject
///     20/700 mono primary lineHeight 1.3.
///   - senderCard (padding [14,20], gap 12 vertical):
///     sHead gap 12: avatar 44×44 cornerRadius 22 (color per sender),
///       initials 14/700 white. meta col gap 2: name 15/700 + time 11/normal
///       (space_between), "to me, +N" + chevron-down row gap 6 (12/normal).
///     body (gap 10): paragraphs + optional image placeholder 180h
///       cornerRadius 12 fill #1A1A1A + signature.
///     "ATTACHMENTS · N" 10/700 secondary letterSpacing 1.5.
///     attRow gap 10 (horizontal row, each card flex): cornerRadius 10,
///       padding [10,12], gap 10. Icon 32×32 cornerRadius 8 tinted, title
///       12/700 primary + subtitle 10/normal (secondary or accent for ICS).
///     quotedSect (cornerRadius 10, fill wm-bg, 2px left border, padding
///       [10,12], gap 8): reply icon 12 + "On … wrote:" 11/600 secondary,
///       body 12/normal secondary lineHeight 1.5.
class ThreadScreenV3 extends ConsumerWidget {
  const ThreadScreenV3({super.key, required this.emailId});

  final String emailId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final emailAsync = ref.watch(emailDetailProvider(emailId));

    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: emailAsync.when(
          loading: () => const _Loading(),
          error: (err, _) => _ErrorState(message: err.toString()),
          data: (email) => _ThreadContent(email: email),
        ),
      ),
    );
  }
}

class _ThreadContent extends ConsumerWidget {
  const _ThreadContent({required this.email});
  final Email email;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final me = ref.watch(authControllerProvider).user?.email;
    return CustomScrollView(
      physics: const AlwaysScrollableScrollPhysics(),
      slivers: [
        SliverToBoxAdapter(
          child: _TopBar(
            folderLabel: email.folder.toUpperCase(),
            onBack: () => Navigator.of(context).maybePop(),
            onReply: () => context.push(
              '/compose',
              extra: ComposeFromEmail.reply(email, userEmail: me),
            ),
            onReplyAll: () => context.push(
              '/compose',
              extra: ComposeFromEmail.replyAll(email, userEmail: me),
            ),
            onForward: () => context.push(
              '/compose',
              extra: ComposeFromEmail.forward(email),
            ),
            onMore: () => _openMoreSheet(context, ref, email),
          ),
        ),
        SliverToBoxAdapter(child: _SubjectBlock(email: email)),
        SliverToBoxAdapter(
          child: _SenderCard(email: email, me: me),
        ),
        SliverToBoxAdapter(
          child: MeetingExtractionChip(emailId: email.id),
        ),
        SliverToBoxAdapter(child: ReplySuggestionStrip(email: email)),
        const SliverToBoxAdapter(child: SizedBox(height: 32)),
      ],
    );
  }

  void _openMoreSheet(BuildContext context, WidgetRef ref, Email email) {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: AppColors.surface,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            _SheetItem(
              icon: LucideIcons.tag,
              label: 'Labels',
              onTap: () {
                Navigator.pop(ctx);
                context.push('/email/${email.id}/labels');
              },
            ),
            _SheetItem(
              icon: LucideIcons.star,
              label: email.isStarred ? 'Unstar' : 'Star',
              onTap: () async {
                Navigator.pop(ctx);
                try {
                  final repo = await ref.read(mailRepositoryProvider.future);
                  await repo.toggleStar(email.id);
                  ref.invalidate(emailDetailProvider(email.id));
                } catch (err) {
                  showRootSnackBar(SnackBar(content: Text('$err')));
                }
              },
            ),
            _SheetItem(
              icon: LucideIcons.archive,
              label: 'Archive',
              onTap: () async {
                Navigator.pop(ctx);
                try {
                  final repo = await ref.read(mailRepositoryProvider.future);
                  await repo.archive(email.id);
                  ref
                      .read(inboxControllerProvider.notifier)
                      .removeLocal(email.id);
                  if (context.mounted) Navigator.of(context).maybePop();
                } catch (err) {
                  showRootSnackBar(SnackBar(content: Text('$err')));
                }
              },
            ),
            _SheetItem(
              icon: LucideIcons.trash2,
              label: 'Delete',
              onTap: () async {
                Navigator.pop(ctx);
                try {
                  final repo = await ref.read(mailRepositoryProvider.future);
                  await repo.delete(email.id);
                  ref
                      .read(inboxControllerProvider.notifier)
                      .removeLocal(email.id);
                  if (context.mounted) Navigator.of(context).maybePop();
                } catch (err) {
                  showRootSnackBar(SnackBar(content: Text('$err')));
                }
              },
            ),
          ],
        ),
      ),
    );
  }
}

class _TopBar extends StatelessWidget {
  const _TopBar({
    required this.folderLabel,
    required this.onBack,
    required this.onReply,
    required this.onReplyAll,
    required this.onForward,
    required this.onMore,
  });

  final String folderLabel;
  final VoidCallback onBack;
  final VoidCallback onReply;
  final VoidCallback onReplyAll;
  final VoidCallback onForward;
  final VoidCallback onMore;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      child: Row(
        children: [
          _CircleBtn(icon: LucideIcons.arrowLeft, onTap: onBack),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.only(left: 14, right: 8),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  folderLabel,
                  style: GoogleFonts.jetBrainsMono(
                    color: AppColors.textSecondary,
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 1.5,
                  ),
                ),
              ),
            ),
          ),
          _CircleBtn(icon: LucideIcons.reply, onTap: onReply),
          const SizedBox(width: 6),
          _CircleBtn(icon: LucideIcons.replyAll, onTap: onReplyAll),
          const SizedBox(width: 6),
          _CircleBtn(icon: LucideIcons.forward, onTap: onForward),
          const SizedBox(width: 6),
          _CircleBtn(icon: LucideIcons.ellipsisVertical, onTap: onMore),
        ],
      ),
    );
  }
}

class _CircleBtn extends StatelessWidget {
  const _CircleBtn({required this.icon, required this.onTap});
  final IconData icon;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    // Design: 40×40 cornerRadius 20 wm-surface, icon 18 primary.
    return InkWell(
      onTap: onTap,
      customBorder: const CircleBorder(),
      child: Container(
        width: 40,
        height: 40,
        decoration: const BoxDecoration(
          color: AppColors.surface,
          shape: BoxShape.circle,
        ),
        alignment: Alignment.center,
        child: Icon(icon, size: 18, color: AppColors.textPrimary),
      ),
    );
  }
}

class _SubjectBlock extends StatelessWidget {
  const _SubjectBlock({required this.email});
  final Email email;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (email.labels.isNotEmpty) ...[
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: email.labels.map(_labelChip).toList(growable: false),
            ),
            const SizedBox(height: 10),
          ],
          Text(
            email.subject.isEmpty ? '(no subject)' : email.subject,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: GoogleFonts.jetBrainsMono(
              color: AppColors.textPrimary,
              fontSize: 20,
              fontWeight: FontWeight.w700,
              height: 1.3,
            ),
          ),
        ],
      ),
    );
  }

  Widget _labelChip(EmailLabelRef label) {
    final color = _parseColor(label.color) ?? AppColors.accent;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.2),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(
        label.name.toUpperCase(),
        style: GoogleFonts.jetBrainsMono(
          color: color,
          fontSize: 9,
          fontWeight: FontWeight.w700,
          letterSpacing: 1,
        ),
      ),
    );
  }

  Color? _parseColor(String hex) {
    var h = hex.trim().replaceAll('#', '');
    if (h.length == 6) h = 'FF$h';
    if (h.length != 8) return null;
    final v = int.tryParse(h, radix: 16);
    return v == null ? null : Color(v);
  }
}

class _SenderCard extends ConsumerWidget {
  const _SenderCard({required this.email, required this.me});
  final Email email;
  final String? me;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _SenderHead(email: email, me: me),
          const SizedBox(height: 12),
          // Body renderer (HTML/plain text/inline images). The design places
          // paragraphs with 10px gaps; EmailBody already handles that spacing
          // internally so we don't re-wrap each paragraph.
          EmailBody(email: email),
          if (email.attachments.isNotEmpty) ...[
            const SizedBox(height: 12),
            _AttachmentsLabel(count: email.attachments.length),
            const SizedBox(height: 10),
            _AttachmentRow(attachments: email.attachments),
          ],
          if (_hasQuoted(email)) ...[
            const SizedBox(height: 12),
            _QuotedSection(email: email),
          ],
        ],
      ),
    );
  }

  bool _hasQuoted(Email email) {
    final text = email.textBody ?? '';
    return text.contains('\nOn ') && text.contains(' wrote:');
  }
}

class _SenderHead extends StatefulWidget {
  const _SenderHead({required this.email, required this.me});
  final Email email;
  final String? me;

  @override
  State<_SenderHead> createState() => _SenderHeadState();
}

class _SenderHeadState extends State<_SenderHead> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final email = widget.email;
    final me = widget.me;
    return Column(
      children: [
        InkWell(
          onTap: () => setState(() => _expanded = !_expanded),
          borderRadius: BorderRadius.circular(12),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              _SenderAvatar(email: email),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            email.senderName,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: GoogleFonts.jetBrainsMono(
                              color: AppColors.textPrimary,
                              fontSize: 15,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                        Text(
                          _relativeAge(email.createdAt),
                          style: GoogleFonts.jetBrainsMono(
                            color: AppColors.textSecondary,
                            fontSize: 11,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 2),
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            _toLabel(email, me),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: GoogleFonts.jetBrainsMono(
                              color: AppColors.textSecondary,
                              fontSize: 12,
                            ),
                          ),
                        ),
                        const SizedBox(width: 6),
                        Icon(
                          _expanded
                              ? LucideIcons.chevronUp
                              : LucideIcons.chevronDown,
                          size: 12,
                          color: AppColors.textSecondary,
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        if (_expanded) ...[
          const SizedBox(height: 10),
          _SenderDetails(email: email),
        ],
      ],
    );
  }

  String _toLabel(Email email, String? me) {
    final to = email.toAddresses;
    final cc = email.cc;
    final meLower = me?.toLowerCase();
    final toIncludesMe =
        meLower != null && to.any((a) => a.toLowerCase().contains(meLower));
    final extraCount = to.length + cc.length - (toIncludesMe ? 1 : 0);
    if (toIncludesMe) {
      return extraCount > 0 ? 'to me, +$extraCount' : 'to me';
    }
    if (to.isEmpty) return '';
    final first = _shortAddress(to.first);
    return extraCount - 1 > 0 ? 'to $first, +${extraCount - 1}' : 'to $first';
  }

  String _shortAddress(String addr) {
    final m = RegExp(r'^\s*"?([^"<]+?)"?\s*<').firstMatch(addr);
    if (m != null) return m.group(1)!.trim();
    return addr.split('@').first;
  }

  static String _relativeAge(DateTime t) {
    final delta = DateTime.now().difference(t);
    if (delta.inMinutes < 60) return '${delta.inMinutes}m ago';
    if (delta.inHours < 24) return '${delta.inHours}h ago';
    if (delta.inDays < 7) return '${delta.inDays}d ago';
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
    return '${months[t.month - 1]} ${t.day}';
  }
}

class _SenderDetails extends StatelessWidget {
  const _SenderDetails({required this.email});
  final Email email;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        children: [
          _DetailLine(label: 'FROM', value: email.fromAddress),
          _DetailLine(label: 'TO', value: email.toAddresses.join(', ')),
          if (email.cc.isNotEmpty)
            _DetailLine(label: 'CC', value: email.cc.join(', ')),
          _DetailLine(label: 'DATE', value: _fullDate(email.createdAt)),
        ],
      ),
    );
  }

  String _fullDate(DateTime date) {
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
    final local = date.toLocal();
    final minute = local.minute.toString().padLeft(2, '0');
    return '${months[local.month - 1]} ${local.day}, ${local.year} '
        '${local.hour}:$minute';
  }
}

class _DetailLine extends StatelessWidget {
  const _DetailLine({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    if (value.trim().isEmpty) return const SizedBox.shrink();
    return InkWell(
      onLongPress: () => _copyValue(value),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(
              width: 42,
              child: Text(
                label,
                style: GoogleFonts.jetBrainsMono(
                  color: AppColors.textSecondary,
                  fontSize: 10,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 1,
                ),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                value,
                softWrap: true,
                style: GoogleFonts.jetBrainsMono(
                  color: AppColors.textPrimary,
                  fontSize: 12,
                  height: 1.35,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _copyValue(String value) {
    Clipboard.setData(ClipboardData(text: value));
    HapticFeedback.selectionClick();
  }
}

class _SenderAvatar extends StatelessWidget {
  const _SenderAvatar({required this.email});
  final Email email;
  @override
  Widget build(BuildContext context) {
    // 40×40 to match the web `wdAvatar` node (PpYjY). Was 44×44 — the
    // mobile design comment cited a stale spec.
    return Container(
      width: 40,
      height: 40,
      decoration: BoxDecoration(
        color: email.senderAvatarColor,
        shape: BoxShape.circle,
      ),
      alignment: Alignment.center,
      child: Text(
        email.senderInitials,
        style: GoogleFonts.jetBrainsMono(
          color: Colors.white,
          fontSize: 14,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

class _AttachmentsLabel extends StatelessWidget {
  const _AttachmentsLabel({required this.count});
  final int count;
  @override
  Widget build(BuildContext context) {
    return Text(
      'ATTACHMENTS · $count',
      style: GoogleFonts.jetBrainsMono(
        color: AppColors.textSecondary,
        fontSize: 10,
        fontWeight: FontWeight.w700,
        letterSpacing: 1.5,
      ),
    );
  }
}

class _AttachmentRow extends StatelessWidget {
  const _AttachmentRow({required this.attachments});
  final List<EmailAttachment> attachments;
  @override
  Widget build(BuildContext context) {
    // Design attRow gap 10 horizontal. Cards fill_container width-share.
    return Row(
      children: [
        for (int i = 0; i < attachments.length; i++) ...[
          Expanded(child: _AttachmentCard(attachment: attachments[i])),
          if (i < attachments.length - 1) const SizedBox(width: 10),
        ],
      ],
    );
  }
}

class _AttachmentCard extends ConsumerWidget {
  const _AttachmentCard({required this.attachment});
  final EmailAttachment attachment;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final (icon, iconColor, fillColor) = _iconFor(attachment);
    final isIcs = _isIcs(attachment);
    return InkWell(
      onTap: () async {
        final client = await ref.read(apiClientProvider.future);
        final url = client.absoluteUrl(
          '/api/v1/inbox/attachments/${attachment.id}/download',
        );
        await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
      },
      borderRadius: BorderRadius.circular(10),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(10),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                color: fillColor,
                borderRadius: BorderRadius.circular(8),
              ),
              alignment: Alignment.center,
              child: Icon(icon, color: iconColor, size: 16),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    attachment.filename,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: GoogleFonts.jetBrainsMono(
                      color: AppColors.textPrimary,
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 1),
                  Text(
                    isIcs
                        ? _icsSubtitle(attachment)
                        : _fmtSize(attachment.sizeBytes),
                    style: GoogleFonts.jetBrainsMono(
                      color: isIcs ? AppColors.accent : AppColors.textSecondary,
                      fontSize: 10,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  bool _isIcs(EmailAttachment a) {
    return a.contentType.toLowerCase().contains('text/calendar') ||
        a.filename.toLowerCase().endsWith('.ics');
  }

  (IconData, Color, Color) _iconFor(EmailAttachment a) {
    final ext = a.filename.toLowerCase();
    if (_isIcs(a)) {
      return (LucideIcons.calendar, AppColors.accent, AppColors.accentDim);
    }
    if (ext.endsWith('.pdf') || a.contentType.contains('pdf')) {
      return (
        LucideIcons.fileText,
        const Color(0xFFFF8B8B),
        const Color(0xFFD44A4A).withValues(alpha: 0.2),
      );
    }
    if (a.contentType.startsWith('image/')) {
      return (
        LucideIcons.image,
        const Color(0xFF6FAEFF),
        const Color(0xFF1B6FE0).withValues(alpha: 0.2),
      );
    }
    return (
      LucideIcons.file,
      AppColors.textSecondary,
      AppColors.surfaceElevated,
    );
  }

  String _icsSubtitle(EmailAttachment a) {
    // Placeholder — the real ICS parser lives in the ICS card. For the
    // row, show a static marker until we wire parsing.
    return 'Calendar invite';
  }

  String _fmtSize(int bytes) {
    if (bytes < 1024) return '${bytes}B';
    if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(0)}KB';
    return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
  }
}

class _QuotedSection extends StatelessWidget {
  const _QuotedSection({required this.email});
  final Email email;
  @override
  Widget build(BuildContext context) {
    final quote = _extractQuote(email.textBody ?? '');
    if (quote == null) return const SizedBox.shrink();
    // Design quotedSect: cornerRadius 10, fill wm-bg, 2px left border,
    // padding [10,12], gap 8.
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: AppColors.background,
        borderRadius: BorderRadius.circular(10),
        border: const Border(
          left: BorderSide(color: AppColors.border, width: 2),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(
                LucideIcons.reply,
                size: 12,
                color: AppColors.textSecondary,
              ),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  quote.header,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: GoogleFonts.jetBrainsMono(
                    color: AppColors.textSecondary,
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            quote.body,
            maxLines: 6,
            overflow: TextOverflow.ellipsis,
            style: GoogleFonts.jetBrainsMono(
              color: AppColors.textSecondary,
              fontSize: 12,
              height: 1.5,
            ),
          ),
        ],
      ),
    );
  }

  _Quote? _extractQuote(String text) {
    final headerMatch = RegExp(
      r'(On .+? wrote:)',
      multiLine: true,
    ).firstMatch(text);
    if (headerMatch == null) return null;
    final after = text.substring(headerMatch.end);
    final cleaned = after
        .split('\n')
        .map((line) => line.startsWith('> ') ? line.substring(2) : line)
        .join('\n')
        .trim();
    if (cleaned.isEmpty) return null;
    return _Quote(header: headerMatch.group(1) ?? '', body: cleaned);
  }
}

class _Quote {
  const _Quote({required this.header, required this.body});
  final String header;
  final String body;
}

class _SheetItem extends StatelessWidget {
  const _SheetItem({
    required this.icon,
    required this.label,
    required this.onTap,
  });
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
        child: Row(
          children: [
            Icon(icon, color: AppColors.textPrimary, size: 20),
            const SizedBox(width: 14),
            Text(
              label,
              style: GoogleFonts.jetBrainsMono(
                color: AppColors.textPrimary,
                fontSize: 14,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Loading extends StatelessWidget {
  const _Loading();
  @override
  Widget build(BuildContext context) {
    return const SingleChildScrollView(
      physics: NeverScrollableScrollPhysics(),
      child: Padding(
        padding: EdgeInsets.fromLTRB(12, 8, 12, 24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _SkeletonTopBar(),
            SizedBox(height: 24),
            Padding(
              padding: EdgeInsets.symmetric(horizontal: 8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _SkeletonBar(width: double.infinity, height: 28),
                  SizedBox(height: 10),
                  _SkeletonBar(width: 230, height: 28),
                  SizedBox(height: 28),
                  Row(
                    children: [
                      _SkeletonBar(width: 44, height: 44, radius: 22),
                      SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            _SkeletonBar(width: 140, height: 16),
                            SizedBox(height: 8),
                            _SkeletonBar(width: 84, height: 12),
                          ],
                        ),
                      ),
                      _SkeletonBar(width: 44, height: 12),
                    ],
                  ),
                  SizedBox(height: 28),
                  _SkeletonBar(width: double.infinity, height: 120, radius: 12),
                  SizedBox(height: 12),
                  _SkeletonBar(width: double.infinity, height: 14),
                  SizedBox(height: 8),
                  _SkeletonBar(width: 260, height: 14),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SkeletonTopBar extends StatelessWidget {
  const _SkeletonTopBar();

  @override
  Widget build(BuildContext context) {
    return Row(
      children: const [
        _SkeletonBar(width: 40, height: 40, radius: 20),
        SizedBox(width: 22),
        _SkeletonBar(width: 64, height: 12),
        Spacer(),
        _SkeletonBar(width: 40, height: 40, radius: 20),
        SizedBox(width: 6),
        _SkeletonBar(width: 40, height: 40, radius: 20),
        SizedBox(width: 6),
        _SkeletonBar(width: 40, height: 40, radius: 20),
      ],
    );
  }
}

class _SkeletonBar extends StatelessWidget {
  const _SkeletonBar({
    required this.width,
    required this.height,
    this.radius = 3,
  });

  final double width;
  final double height;
  final double radius;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(radius),
      ),
    );
  }
}

class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.message});
  final String message;
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(
            LucideIcons.cloudOff,
            color: AppColors.textTertiary,
            size: 48,
          ),
          const SizedBox(height: 12),
          Text(
            "Couldn't load this message",
            style: GoogleFonts.jetBrainsMono(
              color: AppColors.textPrimary,
              fontSize: 14,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            message,
            textAlign: TextAlign.center,
            maxLines: 3,
            style: GoogleFonts.jetBrainsMono(
              color: AppColors.textTertiary,
              fontSize: 11,
            ),
          ),
        ],
      ),
    );
  }
}
