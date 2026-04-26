import 'dart:async';

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
/// area.
///
/// Two visibility rules beyond the obvious "API returned non-empty":
///
///  - If the thread already has any outbound message from the current
///    user, hide. The chips are reply STARTERS — they're noise once
///    the user has already replied.
///
///  - If suggestions come back empty on first open, the worker is
///    still generating. Invalidate on a timer (5s × 6 attempts) until
///    non-empty or the retry budget runs out. Without this the user
///    has to back out and reopen to see suggestions, which is the
///    bug-report symptom from the live device.
class ReplySuggestionStrip extends ConsumerStatefulWidget {
  const ReplySuggestionStrip({super.key, required this.email});

  final Email email;

  @override
  ConsumerState<ReplySuggestionStrip> createState() =>
      _ReplySuggestionStripState();
}

class _ReplySuggestionStripState extends ConsumerState<ReplySuggestionStrip> {
  Timer? _pollTimer;
  int _pollAttempts = 0;
  static const int _maxPollAttempts = 6;
  static const Duration _pollInterval = Duration(seconds: 5);

  void _ensurePolling(bool empty) {
    if (!empty) {
      _pollTimer?.cancel();
      _pollTimer = null;
      return;
    }
    if (_pollTimer != null) return;
    if (_pollAttempts >= _maxPollAttempts) return;
    _pollTimer = Timer.periodic(_pollInterval, (_) {
      _pollAttempts++;
      if (!mounted) return;
      ref.invalidate(replySuggestionsProvider(widget.email.id));
      if (_pollAttempts >= _maxPollAttempts) {
        _pollTimer?.cancel();
        _pollTimer = null;
      }
    });
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final asyncSuggestions =
        ref.watch(replySuggestionsProvider(widget.email.id));
    final asyncThread = ref.watch(threadMessagesProvider(widget.email.id));
    final me = ref.watch(authControllerProvider).user?.email.toLowerCase();

    // Dismiss rule: any outbound message from me in this thread → hide.
    final userHasReplied = asyncThread.maybeWhen(
      data: (messages) {
        if (me == null) return false;
        for (final m in messages) {
          final from = (m['fromAddress'] as String?)?.toLowerCase();
          if (from == me) return true;
        }
        return false;
      },
      orElse: () => false,
    );
    if (userHasReplied) return const SizedBox.shrink();

    return asyncSuggestions.when(
      loading: () => const SizedBox.shrink(),
      error: (_, __) => const SizedBox.shrink(),
      data: (suggestions) {
        // Side-effect: kick polling on/off based on whether we have
        // results yet. Done in build because invalidating the provider
        // would otherwise need an extra notifier layer.
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (!mounted) return;
          _ensurePolling(suggestions.isEmpty);
        });
        if (suggestions.isEmpty) return const SizedBox.shrink();
        return Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Icon(LucideIcons.sparkles,
                      size: 12, color: AppColors.accent),
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
                          widget.email,
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
