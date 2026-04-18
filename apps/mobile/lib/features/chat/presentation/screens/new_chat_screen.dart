import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../../../core/theme/app_colors.dart';
import '../providers/chat_providers.dart';

class NewChatScreen extends ConsumerStatefulWidget {
  const NewChatScreen({super.key});

  @override
  ConsumerState<NewChatScreen> createState() => _NewChatScreenState();
}

class _NewChatScreenState extends ConsumerState<NewChatScreen> {
  final _emailController = TextEditingController();
  bool _creating = false;
  String? _error;

  @override
  void dispose() {
    _emailController.dispose();
    super.dispose();
  }

  Future<void> _createDirect() async {
    final email = _emailController.text.trim();
    if (email.isEmpty) {
      setState(() => _error = "Enter the person's email");
      return;
    }
    setState(() {
      _creating = true;
      _error = null;
    });

    try {
      final repo = await ref.read(chatRepositoryProvider.future);
      final id = await repo.createDirectConversation(email);
      // Refresh the list so the new conversation shows up if we come back.
      ref.invalidate(chatListControllerProvider);
      if (!mounted) return;
      context.pushReplacement('/conversation/$id');
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _creating = false;
        _error = _format(e);
      });
    }
  }

  String _format(Object error) {
    final msg = error.toString();
    final match = RegExp(r'ApiException\([^)]*\):\s*(.*)$').firstMatch(msg);
    return match != null ? match.group(1)! : 'Could not create chat.';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.background,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: AppColors.textPrimary),
          onPressed: () => context.pop(),
        ),
        title: Text(
          'New Chat',
          style: GoogleFonts.inter(
            fontSize: 18,
            fontWeight: FontWeight.w600,
            color: AppColors.textPrimary,
          ),
        ),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: AppColors.surface,
                borderRadius: BorderRadius.circular(10),
              ),
              child: Row(
                children: [
                  const Icon(Icons.group_outlined, color: AppColors.accent),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      'Create Group Chat',
                      style: GoogleFonts.inter(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: AppColors.accent,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),
            Text(
              "START A DIRECT CHAT",
              style: GoogleFonts.inter(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: AppColors.textSecondary,
                letterSpacing: 0.8,
              ),
            ),
            const SizedBox(height: 8),
            TextField(
              key: const Key('new-chat-email'),
              controller: _emailController,
              keyboardType: TextInputType.emailAddress,
              style: GoogleFonts.inter(fontSize: 14, color: AppColors.textPrimary),
              decoration: const InputDecoration(
                hintText: 'colleague@wistfare.com',
                prefixIcon: Icon(Icons.alternate_email, size: 18, color: AppColors.textTertiary),
              ),
              onSubmitted: (_) => _createDirect(),
            ),
            if (_error != null) ...[
              const SizedBox(height: 12),
              Text(
                _error!,
                style: GoogleFonts.inter(fontSize: 13, color: AppColors.badgeRed),
              ),
            ],
            const SizedBox(height: 16),
            ElevatedButton(
              key: const Key('new-chat-submit'),
              onPressed: _creating ? null : _createDirect,
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.accent,
                foregroundColor: AppColors.background,
                elevation: 0,
                minimumSize: const Size(double.infinity, 48),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
              ),
              child: Text(
                _creating ? 'Creating…' : 'Start chat',
                style: GoogleFonts.inter(fontSize: 15, fontWeight: FontWeight.w600),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
