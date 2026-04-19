import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../domain/email.dart';
import '../providers/mail_providers.dart';

/// Mobile/Compose — design.lib.pen node `wr2Bw`. Sharp From/To/Cc/Subject
/// rows separated by 1px hairlines, lime "Send" pill in top right,
/// formatting toolbar at bottom.
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

  List<String> _splitAddresses(String raw) => raw
      .split(RegExp(r'[,;\s]+'))
      .map((s) => s.trim())
      .where((s) => s.isNotEmpty)
      .toList();

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
      await repo.compose(ComposeDraft(
        fromAddress: mailbox.address,
        mailboxId: mailbox.id,
        toAddresses: to,
        cc: _splitAddresses(_ccController.text),
        subject: _subjectController.text,
        textBody: _bodyController.text,
        send: true,
      ));
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
    final m = RegExp(r'ApiException\([^)]*\):\s*(.*)$').firstMatch(msg);
    return m != null ? m.group(1)! : 'Failed to send email.';
  }

  @override
  Widget build(BuildContext context) {
    final mailboxes = ref.watch(mailboxesProvider);

    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: Column(
          children: [
            _Header(
              isSending: _isSending,
              onClose: () => context.pop(),
              onSend: () => mailboxes.whenOrNull(
                data: (list) => list.isEmpty ? null : _send(list.first),
              ),
            ),
            Expanded(
              child: mailboxes.when(
                data: (list) {
                  if (list.isEmpty) {
                    return Center(
                      child: Padding(
                        padding: const EdgeInsets.all(32),
                        child: Text(
                          'No mailbox set up yet. Configure one on the web app to send mail.',
                          textAlign: TextAlign.center,
                          style: AppTextStyles.bodySmall,
                        ),
                      ),
                    );
                  }
                  return _Form(
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
                    width: 22,
                    height: 22,
                    child: CircularProgressIndicator(
                        strokeWidth: 2, color: AppColors.accent),
                  ),
                ),
                error: (err, _) => Center(
                  child: Padding(
                    padding: const EdgeInsets.all(32),
                    child:
                        Text(_format(err), style: AppTextStyles.bodySmall),
                  ),
                ),
              ),
            ),
            const _FormatBar(),
          ],
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({
    required this.isSending,
    required this.onClose,
    required this.onSend,
  });
  final bool isSending;
  final VoidCallback onClose;
  final VoidCallback onSend;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 56,
      padding: const EdgeInsets.symmetric(horizontal: 8),
      child: Row(
        children: [
          IconButton(
            splashRadius: 22,
            icon: const Icon(Icons.close, size: 22),
            color: AppColors.textPrimary,
            onPressed: onClose,
          ),
          const SizedBox(width: 4),
          Text('New Message', style: AppTextStyles.titleMedium),
          const Spacer(),
          _SendButton(isSending: isSending, onPressed: onSend),
          const SizedBox(width: 8),
        ],
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
    return Material(
      color: AppColors.accent,
      child: InkWell(
        onTap: isSending ? null : onPressed,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              isSending
                  ? const SizedBox(
                      width: 12,
                      height: 12,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: AppColors.background),
                    )
                  : const Icon(Icons.send_rounded,
                      size: 14, color: AppColors.background),
              const SizedBox(width: 6),
              Text(
                isSending ? 'Sending…' : 'Send',
                style: GoogleFonts.inter(
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  color: AppColors.background,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Form extends StatelessWidget {
  const _Form({
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
        const Divider(color: AppColors.border, height: 1),
        _Row(
          label: 'From',
          child: Text(fromAddress,
              style: AppTextStyles.monoSmall.copyWith(fontSize: 13)),
        ),
        const Divider(color: AppColors.border, height: 1),
        _Row(
          label: 'To',
          child: _Input(
              controller: toController, hint: 'name@domain.com'),
        ),
        const Divider(color: AppColors.border, height: 1),
        _Row(
          label: 'Cc',
          child:
              _Input(controller: ccController, hint: 'Add recipients...'),
        ),
        const Divider(color: AppColors.border, height: 1),
        _Row(
          label: 'Subject',
          child: _Input(controller: subjectController),
        ),
        const Divider(color: AppColors.border, height: 1),
        if (errorMessage != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
            child: Text(errorMessage!,
                style: AppTextStyles.bodySmall
                    .copyWith(color: AppColors.danger)),
          ),
        Expanded(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 16),
            child: TextField(
              controller: bodyController,
              maxLines: null,
              expands: true,
              textAlignVertical: TextAlignVertical.top,
              cursorColor: AppColors.accent,
              style: GoogleFonts.inter(
                fontSize: 14,
                color: AppColors.textPrimary,
                height: 1.6,
              ),
              decoration: InputDecoration(
                hintText: 'Write your message...',
                hintStyle: GoogleFonts.inter(
                  fontSize: 14,
                  color: AppColors.textTertiary,
                ),
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

class _Row extends StatelessWidget {
  const _Row({required this.label, required this.child});
  final String label;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          SizedBox(
            width: 56,
            child: Text(
              label,
              style: GoogleFonts.jetBrainsMono(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: AppColors.textTertiary,
                letterSpacing: 0.4,
              ),
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
      cursorColor: AppColors.accent,
      style: AppTextStyles.monoSmall.copyWith(
        color: AppColors.textPrimary,
        fontSize: 13,
      ),
      decoration: InputDecoration(
        hintText: hint,
        hintStyle: AppTextStyles.monoSmall.copyWith(
          color: AppColors.textTertiary,
          fontSize: 13,
        ),
        border: InputBorder.none,
        enabledBorder: InputBorder.none,
        focusedBorder: InputBorder.none,
        isDense: true,
        contentPadding: EdgeInsets.zero,
        filled: false,
      ),
    );
  }
}

class _FormatBar extends StatelessWidget {
  const _FormatBar();

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        border: Border(top: BorderSide(color: AppColors.border, width: 1)),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      child: Row(
        children: [
          _ToolbarIcon(icon: Icons.format_bold, onTap: () {}),
          _ToolbarIcon(icon: Icons.format_italic, onTap: () {}),
          _ToolbarIcon(icon: Icons.format_underline, onTap: () {}),
          _ToolbarIcon(icon: Icons.format_list_bulleted, onTap: () {}),
          const Spacer(),
          _ToolbarIcon(icon: Icons.attach_file, onTap: () {}),
          _ToolbarIcon(icon: Icons.more_horiz, onTap: () {}),
        ],
      ),
    );
  }
}

class _ToolbarIcon extends StatelessWidget {
  const _ToolbarIcon({required this.icon, required this.onTap});
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return IconButton(
      splashRadius: 20,
      icon: Icon(icon, size: 20),
      color: AppColors.textTertiary,
      onPressed: onTap,
    );
  }
}
