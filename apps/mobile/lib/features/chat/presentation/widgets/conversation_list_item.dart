import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../../core/widgets/wm_avatar.dart';
import '../../domain/conversation.dart';

/// Mobile/ChatList row — circular avatar, name + last message preview,
/// time + small lime square unread marker.
class ConversationListItem extends StatelessWidget {
  const ConversationListItem({super.key, required this.conversation});

  final Conversation conversation;

  @override
  Widget build(BuildContext context) {
    final unread = conversation.unreadCount > 0;
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: () => context.push('/conversation/${conversation.id}'),
        splashColor: AppColors.surface,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 14, 20, 14),
          child: Row(
            children: [
              WmAvatar(name: conversation.displayName, size: 40),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            conversation.displayName,
                            style: GoogleFonts.inter(
                              fontSize: 14,
                              fontWeight: unread ? FontWeight.w700 : FontWeight.w600,
                              color: AppColors.textPrimary,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        Text(conversation.timeAgo, style: AppTextStyles.meta),
                      ],
                    ),
                    const SizedBox(height: 3),
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            conversation.lastMessagePreview,
                            style: GoogleFonts.inter(
                              fontSize: 13,
                              color: unread
                                  ? AppColors.textPrimary
                                  : AppColors.textTertiary,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        if (unread) ...[
                          const SizedBox(width: 8),
                          Container(
                            width: 10,
                            height: 10,
                            color: AppColors.accent,
                          ),
                        ],
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
