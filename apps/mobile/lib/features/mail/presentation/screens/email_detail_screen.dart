import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../../core/widgets/wm_app_bar.dart';
import '../../../../core/widgets/wm_avatar.dart';
import '../../../../core/widgets/wm_tag.dart';
import '../../domain/email.dart';
import '../providers/mail_providers.dart';

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
              onPressed: () {},
            ),
            _IconAction(
              icon: Icons.reply_all,
              onPressed: () {},
            ),
            _IconAction(
              icon: Icons.forward,
              onPressed: () {},
            ),
            _IconAction(
              icon: Icons.archive_outlined,
              onPressed: () async {
                final repo = await ref.read(mailRepositoryProvider.future);
                await repo.archive(email.id);
                ref.read(inboxControllerProvider.notifier).removeLocal(email.id);
                if (context.mounted) context.pop();
              },
            ),
            _IconAction(
              icon: Icons.delete_outline,
              onPressed: () async {
                final repo = await ref.read(mailRepositoryProvider.future);
                await repo.delete(email.id);
                ref.read(inboxControllerProvider.notifier).removeLocal(email.id);
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
            final repo = await ref.read(mailRepositoryProvider.future);
            final starred = await repo.toggleStar(email.id);
            ref.read(inboxControllerProvider.notifier).applyLocal(
                  email.copyWith(isStarred: starred),
                );
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

class _Body extends StatelessWidget {
  const _Body({required this.email, required this.onToggleStar});
  final Email email;
  final VoidCallback onToggleStar;

  @override
  Widget build(BuildContext context) {
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
          // Tags row (heuristic until backend returns labels)
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: _tagsFor(email),
          ),
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
          const SizedBox(height: 20),
          // Body — JetBrains Mono, gray, generous line-height (matches design)
          SelectableText(
            email.textBody ?? '',
            style: AppTextStyles.monoMedium.copyWith(
              color: AppColors.textSecondary,
            ),
          ),
        ],
      ),
    );
  }

  List<Widget> _tagsFor(Email e) {
    final s = e.subject.toLowerCase();
    final tags = <Widget>[];
    if (s.contains('priority') || s.contains('urgent')) {
      tags.add(const WmTag(label: 'Priority', color: AppColors.tagPriority));
    }
    if (s.contains('work') || s.contains('roadmap')) {
      tags.add(const WmTag(label: 'Work', color: AppColors.tagWork));
    }
    return tags;
  }
}
