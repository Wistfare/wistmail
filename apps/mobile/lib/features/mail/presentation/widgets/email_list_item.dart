import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../../core/widgets/wm_tag.dart';
import '../../domain/email.dart';

/// Mobile/Inbox row — sharp, full-width, separated by 1px hairlines.
class EmailListItem extends StatelessWidget {
  const EmailListItem({super.key, required this.email});

  final Email email;

  @override
  Widget build(BuildContext context) {
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
              if (_tagFor(email) != null) ...[
                const SizedBox(height: 8),
                Padding(
                  padding: const EdgeInsets.only(left: 18),
                  child: _tagFor(email)!,
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget? _tagFor(Email e) {
    final s = e.subject.toLowerCase();
    if (s.contains('priority') || s.contains('urgent')) {
      return const WmTag(label: 'Priority', color: AppColors.tagPriority);
    }
    if (s.contains('digest') || s.contains('weekly')) {
      return const WmTag(label: 'Digest', color: AppColors.tagDigest);
    }
    return null;
  }
}
