import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../../../core/theme/app_colors.dart';
import '../../domain/email.dart';
import '../providers/mail_providers.dart';

class ComposeScreen extends ConsumerStatefulWidget {
  const ComposeScreen({super.key});

  @override
  ConsumerState<ComposeScreen> createState() => _ComposeScreenState();
}

class _ComposeScreenState extends ConsumerState<ComposeScreen> {
  final _toController = TextEditingController();
  final _ccController = TextEditingController();
  final _subjectController = TextEditingController();
  final _bodyController = TextEditingController();
  bool _isSending = false;
  String? _errorMessage;

  @override
  void dispose() {
    _toController.dispose();
    _ccController.dispose();
    _subjectController.dispose();
    _bodyController.dispose();
    super.dispose();
  }

  List<String> _splitAddresses(String raw) {
    return raw
        .split(RegExp(r'[,;\s]+'))
        .map((s) => s.trim())
        .where((s) => s.isNotEmpty)
        .toList();
  }

  Future<void> _send(Mailbox mailbox) async {
    final to = _splitAddresses(_toController.text);
    if (to.isEmpty) {
      setState(() => _errorMessage = 'Add at least one recipient.');
      return;
    }
    setState(() {
      _isSending = true;
      _errorMessage = null;
    });

    try {
      final repo = await ref.read(mailRepositoryProvider.future);
      await repo.compose(
        ComposeDraft(
          fromAddress: mailbox.address,
          mailboxId: mailbox.id,
          toAddresses: to,
          cc: _splitAddresses(_ccController.text),
          subject: _subjectController.text,
          textBody: _bodyController.text,
          send: true,
        ),
      );
      if (!mounted) return;
      context.pop();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _isSending = false;
        _errorMessage = _format(e);
      });
    }
  }

  String _format(Object error) {
    final msg = error.toString();
    final match = RegExp(r'ApiException\([^)]*\):\s*(.*)$').firstMatch(msg);
    return match != null ? match.group(1)! : 'Failed to send email.';
  }

  @override
  Widget build(BuildContext context) {
    final mailboxes = ref.watch(mailboxesProvider);

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.background,
        automaticallyImplyLeading: false,
        leading: IconButton(
          icon: const Icon(Icons.close, color: AppColors.textPrimary),
          onPressed: () => context.pop(),
        ),
        title: Text(
          'New Message',
          style: GoogleFonts.inter(
            fontSize: 16,
            fontWeight: FontWeight.w600,
            color: AppColors.textPrimary,
          ),
        ),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 12),
            child: mailboxes.when(
              data: (list) => list.isEmpty
                  ? const SizedBox.shrink()
                  : _SendButton(
                      isSending: _isSending,
                      onPressed: () => _send(list.first),
                    ),
              loading: () => const SizedBox.shrink(),
              error: (err, stack) => const SizedBox.shrink(),
            ),
          ),
        ],
      ),
      body: mailboxes.when(
        data: (list) {
          if (list.isEmpty) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(32),
                child: Text(
                  'No mailbox set up yet. Configure a mailbox on the web app to send email.',
                  textAlign: TextAlign.center,
                  style: GoogleFonts.inter(color: AppColors.textSecondary),
                ),
              ),
            );
          }
          return _ComposeForm(
            fromAddress: list.first.address,
            toController: _toController,
            ccController: _ccController,
            subjectController: _subjectController,
            bodyController: _bodyController,
            errorMessage: _errorMessage,
          );
        },
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
              _format(err),
              style: GoogleFonts.inter(color: AppColors.textSecondary),
            ),
          ),
        ),
      ),
    );
  }
}

class _SendButton extends StatelessWidget {
  const _SendButton({required this.isSending, required this.onPressed});
  final bool isSending;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return ElevatedButton.icon(
      onPressed: isSending ? null : onPressed,
      style: ElevatedButton.styleFrom(
        backgroundColor: AppColors.accent,
        foregroundColor: AppColors.background,
        elevation: 0,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
      ),
      icon: isSending
          ? const SizedBox(
              width: 14,
              height: 14,
              child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.background),
            )
          : const Icon(Icons.send_rounded, size: 15),
      label: Text(
        isSending ? 'Sending…' : 'Send',
        style: GoogleFonts.inter(fontSize: 14, fontWeight: FontWeight.w600),
      ),
    );
  }
}

class _ComposeForm extends StatelessWidget {
  const _ComposeForm({
    required this.fromAddress,
    required this.toController,
    required this.ccController,
    required this.subjectController,
    required this.bodyController,
    required this.errorMessage,
  });

  final String fromAddress;
  final TextEditingController toController;
  final TextEditingController ccController;
  final TextEditingController subjectController;
  final TextEditingController bodyController;
  final String? errorMessage;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        const Divider(height: 1, color: AppColors.border),
        _Field(
          label: 'From',
          child: Text(
            fromAddress,
            style: GoogleFonts.inter(fontSize: 14, color: AppColors.textSecondary),
          ),
        ),
        const Divider(height: 1, color: AppColors.border),
        _Field(
          label: 'To',
          child: _Input(controller: toController, hint: 'name@domain.com'),
        ),
        const Divider(height: 1, color: AppColors.border),
        _Field(
          label: 'Cc',
          child: _Input(controller: ccController, hint: 'Add recipients…'),
        ),
        const Divider(height: 1, color: AppColors.border),
        _Field(
          label: 'Subject',
          child: _Input(controller: subjectController),
        ),
        const Divider(height: 1, color: AppColors.border),
        if (errorMessage != null) ...[
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
            child: Text(
              errorMessage!,
              style: GoogleFonts.inter(fontSize: 13, color: AppColors.badgeRed),
            ),
          ),
        ],
        Expanded(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
            child: TextField(
              controller: bodyController,
              maxLines: null,
              expands: true,
              textAlignVertical: TextAlignVertical.top,
              style: GoogleFonts.inter(
                fontSize: 14,
                color: AppColors.textPrimary,
                height: 1.6,
              ),
              decoration: const InputDecoration(
                border: InputBorder.none,
                enabledBorder: InputBorder.none,
                focusedBorder: InputBorder.none,
                filled: false,
                contentPadding: EdgeInsets.zero,
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _Field extends StatelessWidget {
  const _Field({required this.label, required this.child});
  final String label;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          SizedBox(
            width: 52,
            child: Text(
              label,
              style: GoogleFonts.inter(fontSize: 13, color: AppColors.textSecondary),
            ),
          ),
          Expanded(child: child),
        ],
      ),
    );
  }
}

class _Input extends StatelessWidget {
  const _Input({required this.controller, this.hint});
  final TextEditingController controller;
  final String? hint;

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      style: GoogleFonts.inter(fontSize: 14, color: AppColors.textPrimary),
      decoration: InputDecoration(
        border: InputBorder.none,
        enabledBorder: InputBorder.none,
        focusedBorder: InputBorder.none,
        isDense: true,
        contentPadding: EdgeInsets.zero,
        filled: false,
        hintText: hint,
        hintStyle: GoogleFonts.inter(fontSize: 14, color: AppColors.textTertiary),
      ),
    );
  }
}
