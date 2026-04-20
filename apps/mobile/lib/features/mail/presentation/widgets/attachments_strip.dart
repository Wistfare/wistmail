import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../../core/network/providers.dart';
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
  const AttachmentsStrip({
    super.key,
    required this.emailId,
    required this.attachments,
  });

  /// Parent email id — needed by the ICS card to POST the RSVP.
  final String emailId;
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
            _IcsCard(emailId: emailId, attachment: ics),
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

class _AttachmentChip extends ConsumerWidget {
  const _AttachmentChip({required this.attachment});
  final EmailAttachment attachment;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final iconData = _iconFor(attachment);
    final color = _colorFor(attachment);
    return InkWell(
      onTap: () async {
        // Open the download URL in the device browser so the platform
        // download manager handles the bytes (resumable, progress,
        // file picker for save location). The URL has to be absolute
        // because url_launcher doesn't know the API host.
        final client = await ref.read(apiClientProvider.future);
        final url = client.absoluteUrl(
          '/api/v1/inbox/attachments/${attachment.id}/download',
        );
        await launchUrl(
          Uri.parse(url),
          mode: LaunchMode.externalApplication,
        );
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

enum _RsvpChoice { accept, tentative, decline }

extension on _RsvpChoice {
  String get apiValue => switch (this) {
        _RsvpChoice.accept => 'accept',
        _RsvpChoice.tentative => 'tentative',
        _RsvpChoice.decline => 'decline',
      };
  String get label => switch (this) {
        _RsvpChoice.accept => 'Yes',
        _RsvpChoice.tentative => 'Maybe',
        _RsvpChoice.decline => 'No',
      };
  String get confirmation => switch (this) {
        _RsvpChoice.accept => 'Accepted',
        _RsvpChoice.tentative => 'Tentative',
        _RsvpChoice.decline => 'Declined',
      };
}

class _IcsCard extends ConsumerStatefulWidget {
  const _IcsCard({required this.emailId, required this.attachment});
  final String emailId;
  final EmailAttachment attachment;

  @override
  ConsumerState<_IcsCard> createState() => _IcsCardState();
}

class _IcsCardState extends ConsumerState<_IcsCard> {
  _RsvpChoice? _confirmed;
  _RsvpChoice? _sending;
  String? _error;

  @override
  void initState() {
    super.initState();
    // Seed from the server-persisted choice so the confirmation pill
    // survives navigation. Without this, backing out of the email
    // detail and returning re-enables the buttons and invites a
    // second RSVP.
    _confirmed = switch (widget.attachment.rsvpResponse) {
      'accept' => _RsvpChoice.accept,
      'tentative' => _RsvpChoice.tentative,
      'decline' => _RsvpChoice.decline,
      _ => null,
    };
  }

  Future<void> _send(_RsvpChoice choice) async {
    if (_sending != null) return;
    setState(() {
      _sending = choice;
      _error = null;
    });
    try {
      final client = await ref.read(apiClientProvider.future);
      await client.dio.post<dynamic>(
        '/api/v1/inbox/emails/${widget.emailId}/attachments/${widget.attachment.id}/rsvp',
        data: {'response': choice.apiValue},
      );
      if (!mounted) return;
      setState(() => _confirmed = choice);
    } on DioException catch (e) {
      if (!mounted) return;
      setState(() =>
          _error = (e.response?.data is Map && (e.response!.data as Map)['error'] is Map
              ? ((e.response!.data as Map)['error'] as Map)['message']?.toString()
              : null) ??
              'Failed to send RSVP');
    } catch (_) {
      if (!mounted) return;
      setState(() => _error = 'Failed to send RSVP');
    } finally {
      if (mounted) setState(() => _sending = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final parsed = widget.attachment.parsedIcs;
    final canRsvp = parsed?.organizerEmail != null && parsed!.organizerEmail!.isNotEmpty;
    final title = parsed?.summary?.trim().isNotEmpty == true
        ? parsed!.summary!.trim()
        : 'Calendar invite';

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
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Icon(Icons.event, size: 18, color: AppColors.accent),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: GoogleFonts.inter(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                        color: AppColors.textPrimary,
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                    if (parsed?.startAt != null) ...[
                      const SizedBox(height: 4),
                      Text(
                        _formatInviteTime(parsed!.startAt!, parsed.endAt, parsed.allDay),
                        style: GoogleFonts.inter(
                          fontSize: 12,
                          color: AppColors.textSecondary,
                        ),
                      ),
                    ],
                    if (parsed?.location != null && parsed!.location!.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Row(
                        children: [
                          const Icon(Icons.place_outlined,
                              size: 11, color: AppColors.textMuted),
                          const SizedBox(width: 4),
                          Expanded(
                            child: Text(
                              parsed.location!,
                              style: GoogleFonts.inter(
                                fontSize: 11,
                                color: AppColors.textMuted,
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ],
                      ),
                    ],
                    if (parsed?.organizerEmail != null) ...[
                      const SizedBox(height: 2),
                      Text(
                        'from ${parsed!.organizerName ?? parsed.organizerEmail}',
                        style: GoogleFonts.jetBrainsMono(
                          fontSize: 10,
                          color: AppColors.textMuted,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ] else ...[
                      const SizedBox(height: 2),
                      Text(
                        '${widget.attachment.filename} · ${_formatBytes(widget.attachment.sizeBytes)}',
                        style: GoogleFonts.jetBrainsMono(
                          fontSize: 10,
                          color: AppColors.textMuted,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              for (final choice in _RsvpChoice.values) ...[
                _RsvpButton(
                  choice: choice,
                  active: _confirmed == choice,
                  loading: _sending == choice,
                  enabled: canRsvp && _sending == null,
                  onTap: () => _send(choice),
                ),
                if (choice != _RsvpChoice.values.last) const SizedBox(width: 8),
              ],
            ],
          ),
          if (_confirmed != null) ...[
            const SizedBox(height: 8),
            Text(
              'RSVP sent · ${_confirmed!.confirmation}',
              style: GoogleFonts.jetBrainsMono(
                fontSize: 10,
                fontWeight: FontWeight.w700,
                color: AppColors.success,
              ),
            ),
          ],
          if (!canRsvp) ...[
            const SizedBox(height: 8),
            Text(
              "No organizer \u2014 can't reply",
              style: GoogleFonts.jetBrainsMono(
                fontSize: 10,
                color: AppColors.textMuted,
              ),
            ),
          ],
          if (_error != null) ...[
            const SizedBox(height: 8),
            Text(
              _error!,
              style: GoogleFonts.jetBrainsMono(
                fontSize: 10,
                color: AppColors.danger,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _RsvpButton extends StatelessWidget {
  const _RsvpButton({
    required this.choice,
    required this.active,
    required this.loading,
    required this.enabled,
    required this.onTap,
  });

  final _RsvpChoice choice;
  final bool active;
  final bool loading;
  final bool enabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final bg = active
        ? AppColors.accent
        : enabled
            ? Colors.transparent
            : Colors.transparent;
    final fg = active
        ? AppColors.background
        : enabled
            ? AppColors.textSecondary
            : AppColors.textMuted;
    return Expanded(
      child: InkWell(
        onTap: enabled ? onTap : null,
        child: Container(
          height: 32,
          decoration: BoxDecoration(
            color: bg,
            border: active
                ? null
                : Border.all(color: enabled ? AppColors.border : AppColors.border.withValues(alpha: 0.5)),
          ),
          alignment: Alignment.center,
          child: loading
              ? SizedBox(
                  height: 14,
                  width: 14,
                  child: CircularProgressIndicator(
                    strokeWidth: 1.5,
                    valueColor: AlwaysStoppedAnimation(fg),
                  ),
                )
              : Text(
                  choice.label,
                  style: GoogleFonts.inter(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: fg,
                  ),
                ),
        ),
      ),
    );
  }
}

String _formatInviteTime(DateTime start, DateTime? end, bool allDay) {
  final local = start.toLocal();
  final dateFmt = DateFormat('EEE, MMM d');
  final timeFmt = DateFormat('h:mm a');
  if (allDay) {
    return '${dateFmt.format(local)} \u00b7 all day';
  }
  final datePart = dateFmt.format(local);
  final startTime = timeFmt.format(local);
  if (end != null) {
    final endLocal = end.toLocal();
    final sameDay = local.year == endLocal.year &&
        local.month == endLocal.month &&
        local.day == endLocal.day;
    final endTime = timeFmt.format(endLocal);
    if (sameDay) return '$datePart \u00b7 $startTime \u2013 $endTime';
    return '$datePart $startTime \u2192 ${dateFmt.format(endLocal)} $endTime';
  }
  return '$datePart \u00b7 $startTime';
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
