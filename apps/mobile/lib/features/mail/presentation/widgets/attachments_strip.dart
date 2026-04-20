import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../../core/theme/app_colors.dart';
import '../../domain/email.dart';

/// Compact paperclip badge for the inbox row. Hidden when count == 0.
class AttachmentBadge extends StatelessWidget {
  const AttachmentBadge({super.key, required this.count});
  final int count;

  @override
  Widget build(BuildContext context) {
    if (count <= 0) return const SizedBox.shrink();
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: AppColors.surface,
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.attach_file,
              size: 11, color: AppColors.textSecondary),
          const SizedBox(width: 4),
          Text(
            '$count',
            style: GoogleFonts.jetBrainsMono(
              fontSize: 10,
              fontWeight: FontWeight.w700,
              color: AppColors.textSecondary,
            ),
          ),
        ],
      ),
    );
  }
}

/// Full attachment strip rendered above the email body in detail.
/// Calendar invites (.ics / text/calendar) get the rich card; other
/// attachments render as tappable chips that open the download URL.
class AttachmentsStrip extends StatelessWidget {
  const AttachmentsStrip({super.key, required this.attachments});

  final List<EmailAttachment> attachments;

  @override
  Widget build(BuildContext context) {
    if (attachments.isEmpty) return const SizedBox.shrink();
    final ics = attachments.firstWhere(
      (a) =>
          a.contentType.toLowerCase().contains('text/calendar') ||
          a.filename.toLowerCase().endsWith('.ics'),
      orElse: () => const EmailAttachment(
        id: '', filename: '', contentType: '', sizeBytes: 0,
      ),
    );
    final others = attachments.where((a) => a.id != ics.id).toList();
    final totalBytes =
        attachments.fold<int>(0, (sum, a) => sum + a.sizeBytes);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
      decoration: const BoxDecoration(
        border: Border(bottom: BorderSide(color: AppColors.border, width: 1)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.attach_file,
                  size: 11, color: AppColors.textMuted),
              const SizedBox(width: 6),
              Text(
                '${attachments.length} ATTACHMENT${attachments.length == 1 ? '' : 'S'} · ${_formatBytes(totalBytes)}',
                style: GoogleFonts.jetBrainsMono(
                  fontSize: 9,
                  fontWeight: FontWeight.w700,
                  color: AppColors.textMuted,
                  letterSpacing: 0.5,
                ),
              ),
            ],
          ),
          if (ics.id.isNotEmpty) ...[
            const SizedBox(height: 10),
            _IcsCard(attachment: ics),
          ],
          if (others.isNotEmpty) ...[
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final a in others) _AttachmentChip(attachment: a),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _AttachmentChip extends StatelessWidget {
  const _AttachmentChip({required this.attachment});
  final EmailAttachment attachment;

  @override
  Widget build(BuildContext context) {
    final iconData = _iconFor(attachment);
    final color = _colorFor(attachment);
    return InkWell(
      onTap: () {
        // Download lands in Phase I follow-up; for now we acknowledge
        // the tap so the user gets feedback. The endpoint URL is
        // ready: /api/v1/inbox/attachments/:id/download.
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        constraints: const BoxConstraints(maxWidth: 220),
        decoration: BoxDecoration(
          color: AppColors.surface,
          border: Border.all(color: AppColors.border),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(iconData, size: 16, color: color),
            const SizedBox(width: 8),
            Flexible(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    attachment.filename,
                    style: GoogleFonts.inter(
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      color: AppColors.textPrimary,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 1),
                  Text(
                    _formatBytes(attachment.sizeBytes),
                    style: GoogleFonts.jetBrainsMono(
                      fontSize: 9,
                      color: AppColors.textMuted,
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
}

class _IcsCard extends StatelessWidget {
  const _IcsCard({required this.attachment});
  final EmailAttachment attachment;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.accentDim,
        border: Border.all(color: AppColors.accent),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.event, size: 18, color: AppColors.accent),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Calendar invite',
                      style: GoogleFonts.inter(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        color: AppColors.textPrimary,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '${attachment.filename} · ${_formatBytes(attachment.sizeBytes)}',
                      style: GoogleFonts.jetBrainsMono(
                        fontSize: 11,
                        color: AppColors.textSecondary,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              _RsvpButton(
                label: 'Yes',
                color: AppColors.accent,
                background: AppColors.accent,
                textColor: AppColors.background,
              ),
              const SizedBox(width: 8),
              _RsvpButton(
                label: 'Maybe',
                color: AppColors.textSecondary,
                background: Colors.transparent,
                textColor: AppColors.textSecondary,
                bordered: true,
              ),
              const SizedBox(width: 8),
              _RsvpButton(
                label: 'No',
                color: AppColors.textSecondary,
                background: Colors.transparent,
                textColor: AppColors.textSecondary,
                bordered: true,
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _RsvpButton extends StatelessWidget {
  const _RsvpButton({
    required this.label,
    required this.color,
    required this.background,
    required this.textColor,
    this.bordered = false,
  });
  final String label;
  final Color color;
  final Color background;
  final Color textColor;
  final bool bordered;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        height: 30,
        decoration: BoxDecoration(
          color: background,
          border: bordered ? Border.all(color: AppColors.border) : null,
        ),
        alignment: Alignment.center,
        child: Text(
          label,
          style: GoogleFonts.inter(
            fontSize: 12,
            fontWeight: FontWeight.w700,
            color: textColor,
          ),
        ),
      ),
    );
  }
}

IconData _iconFor(EmailAttachment a) {
  final ct = a.contentType.toLowerCase();
  final fn = a.filename.toLowerCase();
  if (ct.startsWith('image/') ||
      RegExp(r'\.(png|jpe?g|gif|webp|avif|svg)$').hasMatch(fn)) {
    return Icons.image_outlined;
  }
  if (ct.startsWith('video/') ||
      RegExp(r'\.(mp4|mov|webm|mkv)$').hasMatch(fn)) {
    return Icons.videocam_outlined;
  }
  if (ct == 'application/pdf' || fn.endsWith('.pdf')) {
    return Icons.picture_as_pdf_outlined;
  }
  return Icons.insert_drive_file_outlined;
}

Color _colorFor(EmailAttachment a) {
  final ct = a.contentType.toLowerCase();
  final fn = a.filename.toLowerCase();
  if (ct.startsWith('image/') ||
      RegExp(r'\.(png|jpe?g|gif|webp|avif|svg)$').hasMatch(fn)) {
    return const Color(0xFF3B82F6);
  }
  if (ct == 'application/pdf' || fn.endsWith('.pdf')) {
    return AppColors.danger;
  }
  if (ct.startsWith('video/') ||
      RegExp(r'\.(mp4|mov|webm|mkv)$').hasMatch(fn)) {
    return const Color(0xFFA78BFA);
  }
  return AppColors.textSecondary;
}

String _formatBytes(int bytes) {
  if (bytes < 1024) return '$bytes B';
  if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(1)} KB';
  return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
}
