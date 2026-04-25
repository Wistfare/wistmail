import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../auth/presentation/providers/auth_controller.dart';
import '../../domain/compose_args.dart';
import '../../domain/email.dart';
import '../providers/mail_providers.dart';

/// Horizontal strip of AI-generated reply suggestion chips. Sits below
/// the sender card in the Thread screen and above the floating action
/// area. Renders nothing while the worker is still producing drafts
/// (or if it produced none) — the floor of zero rows == zero pixels
/// keeps the screen unchanged for emails the AI hasn't reached yet.
///
/// Tapping a chip routes to /compose with the body pre-filled. The
/// user always edits before sending — chips are starting points, not
/// auto-replies.
class ReplySuggestionStrip extends ConsumerWidget {
  const ReplySuggestionStrip({super.key, required this.email});

  final Email email;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final asyncSuggestions = ref.watch(replySuggestionsProvider(email.id));
    final me = ref.watch(authControllerProvider).user?.email;

    return asyncSuggestions.when(
      loading: () => const SizedBox.shrink(),
      error: (_, __) => const SizedBox.shrink(),
      data: (suggestions) {
        if (suggestions.isEmpty) return const SizedBox.shrink();
        return Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Icon(LucideIcons.sparkles, size: 12, color: AppColors.accent),
                  const SizedBox(width: 6),
                  Text(
                    'SUGGESTED REPLIES',
                    style: GoogleFonts.jetBrainsMono(
                      color: AppColors.textTertiary,
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 1,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              SizedBox(
                height: 88,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  itemCount: suggestions.length,
                  separatorBuilder: (_, __) => const SizedBox(width: 8),
                  itemBuilder: (context, i) {
                    final s = suggestions[i];
                    return _Chip(
                      tone: s.toneLabel,
                      preview: s.body,
                      onTap: () => context.push(
                        '/compose',
                        extra: ComposeFromEmail.replyWithBody(
                          email,
                          userEmail: me,
                          prefilledBody: s.body,
                        ),
                      ),
                    );
                  },
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({required this.tone, required this.preview, required this.onTap});

  final String tone;
  final String preview;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 240,
      child: Material(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(12),
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  tone.toUpperCase(),
                  style: GoogleFonts.jetBrainsMono(
                    color: AppColors.accent,
                    fontSize: 9,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 1,
                  ),
                ),
                const SizedBox(height: 6),
                Expanded(
                  child: Text(
                    preview,
                    maxLines: 3,
                    overflow: TextOverflow.ellipsis,
                    style: GoogleFonts.jetBrainsMono(
                      color: AppColors.textPrimary,
                      fontSize: 11,
                      fontWeight: FontWeight.w500,
                      height: 1.4,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
