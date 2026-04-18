import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../../../core/theme/app_colors.dart';
import '../../domain/email.dart';
import '../providers/mail_providers.dart';

class EmailDetailScreen extends ConsumerWidget {
  const EmailDetailScreen({super.key, required this.emailId});

  final String emailId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final emailAsync = ref.watch(emailDetailProvider(emailId));

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.background,
        automaticallyImplyLeading: false,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: AppColors.textPrimary),
          onPressed: () => context.pop(),
        ),
        actions: emailAsync.when(
          data: (email) => [
            IconButton(
              icon: Icon(
                email.isStarred ? Icons.star : Icons.star_outline,
                color: email.isStarred ? AppColors.accent : AppColors.textSecondary,
                size: 20,
              ),
              onPressed: () async {
                final repo = await ref.read(mailRepositoryProvider.future);
                final starred = await repo.toggleStar(email.id);
                ref.read(inboxControllerProvider.notifier).applyLocal(
                      email.copyWith(isStarred: starred),
                    );
                ref.invalidate(emailDetailProvider(email.id));
              },
            ),
            IconButton(
              icon: const Icon(Icons.archive_outlined, color: AppColors.textSecondary, size: 20),
              onPressed: () async {
                final repo = await ref.read(mailRepositoryProvider.future);
                await repo.archive(email.id);
                ref.read(inboxControllerProvider.notifier).removeLocal(email.id);
                if (context.mounted) context.pop();
              },
            ),
            IconButton(
              icon: const Icon(Icons.delete_outline, color: AppColors.textSecondary, size: 20),
              onPressed: () async {
                final repo = await ref.read(mailRepositoryProvider.future);
                await repo.delete(email.id);
                ref.read(inboxControllerProvider.notifier).removeLocal(email.id);
                if (context.mounted) context.pop();
              },
            ),
            IconButton(
              icon: const Icon(Icons.label_outline, color: AppColors.textSecondary, size: 20),
              onPressed: () => context.push('/email/${email.id}/labels'),
            ),
          ],
          loading: () => const [SizedBox.shrink()],
          error: (err, stack) => const [SizedBox.shrink()],
        ),
      ),
      body: emailAsync.when(
        data: (email) => _EmailBody(email: email),
        loading: () => const Center(
          child: SizedBox(
            width: 24,
            height: 24,
            child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.accent),
          ),
        ),
        error: (err, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Text(
              err.toString(),
              style: GoogleFonts.inter(color: AppColors.textSecondary),
            ),
          ),
        ),
      ),
    );
  }
}

class _EmailBody extends StatelessWidget {
  const _EmailBody({required this.email});
  final Email email;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            email.subject.isEmpty ? '(no subject)' : email.subject,
            style: GoogleFonts.inter(
              fontSize: 20,
              fontWeight: FontWeight.bold,
              color: AppColors.textPrimary,
            ),
          ),
          const SizedBox(height: 16),
          const Divider(color: AppColors.border, height: 1),
          const SizedBox(height: 16),
          Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  color: email.senderAvatarColor,
                  shape: BoxShape.circle,
                ),
                child: Center(
                  child: Text(
                    email.senderInitials,
                    style: GoogleFonts.inter(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: Colors.white,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 10),
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
                    Text(
                      '${email.senderEmail} · ${email.timeAgo}',
                      style: GoogleFonts.inter(
                        fontSize: 12,
                        color: AppColors.textSecondary,
                      ),
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
              style: GoogleFonts.inter(
                fontSize: 13,
                color: AppColors.textSecondary,
              ),
            ),
          ],
          const SizedBox(height: 20),
          const Divider(color: AppColors.border, height: 1),
          const SizedBox(height: 20),
          Text(
            email.textBody ?? '',
            style: GoogleFonts.inter(
              fontSize: 14,
              color: AppColors.textPrimary,
              height: 1.7,
            ),
          ),
        ],
      ),
    );
  }
}
