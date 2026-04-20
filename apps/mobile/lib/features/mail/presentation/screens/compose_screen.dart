import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../data/mail_actions.dart';
import '../../domain/compose_args.dart';
import '../../domain/email.dart';
import '../providers/mail_providers.dart';
import '../widgets/recipient_chips_field.dart';

/// Mobile/Compose. Supports new compose, reply, reply-all and
/// forward by accepting a `ComposeArgs` constructor parameter (passed
/// from the router via `extra`). To/Cc/Bcc are real chip inputs;
/// Bcc is hidden until the user opts in.
class ComposeScreen extends ConsumerStatefulWidget {
  const ComposeScreen({super.key, this.args = ComposeArgs.empty});

  final ComposeArgs args;

  @override
  ConsumerState<ComposeScreen> createState() => _ComposeScreenState();
}

class _ComposeScreenState extends ConsumerState<ComposeScreen> {
  late List<String> _to;
  late List<String> _cc;
  late List<String> _bcc;
  late final TextEditingController _subjectController;
  late final TextEditingController _bodyController;
  late bool _showCc;
  late bool _showBcc;
  bool _isSending = false;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    _to = List.of(widget.args.toAddresses);
    _cc = List.of(widget.args.cc);
    _bcc = List.of(widget.args.bcc);
    _showCc = _cc.isNotEmpty;
    _showBcc = _bcc.isNotEmpty;
    _subjectController = TextEditingController(text: widget.args.subject);
    _bodyController = TextEditingController(text: widget.args.body);
  }

  @override
  void dispose() {
    _subjectController.dispose();
    _bodyController.dispose();
    super.dispose();
  }

  Future<void> _send(Mailbox mailbox) async {
    if (_to.isEmpty) {
      setState(() => _errorMessage = 'Add at least one recipient.');
      return;
    }
    setState(() {
      _isSending = true;
      _errorMessage = null;
    });
    final draft = ComposeDraft(
      fromAddress: mailbox.address,
      mailboxId: mailbox.id,
      toAddresses: _to,
      cc: _cc,
      bcc: _bcc,
      subject: _subjectController.text,
      textBody: _bodyController.text,
      send: true,
    );
    // Synchronous read — engine is bootstrapped on app start. Falls
    // back to direct repo call when the offline-first stack isn't
    // ready (test env without sqflite).
    final actions = ref.read(mailActionsProvider).valueOrNull;
    try {
      if (actions != null) {
        await actions.send(draft);
      } else {
        final repo = await ref.read(mailRepositoryProvider.future);
        await repo.compose(draft);
      }
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
              title: _headerTitle(),
              isSending: _isSending,
              onClose: () => context.pop(),
              onSend: () {
                // Drop focus first so any chip field with a pending
                // buffer commits its current text into a real chip
                // before we validate _to. Microtask delay gives the
                // focus listener + setState a tick to settle.
                FocusManager.instance.primaryFocus?.unfocus();
                Future.microtask(() {
                  if (!mounted) return;
                  mailboxes.whenOrNull(
                    data: (list) =>
                        list.isEmpty ? null : _send(list.first),
                  );
                });
              },
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
                    to: _to,
                    cc: _cc,
                    bcc: _bcc,
                    showCc: _showCc,
                    showBcc: _showBcc,
                    onToChanged: (v) => setState(() => _to = v),
                    onCcChanged: (v) => setState(() => _cc = v),
                    onBccChanged: (v) => setState(() => _bcc = v),
                    onShowCc: () => setState(() => _showCc = true),
                    onShowBcc: () => setState(() => _showBcc = true),
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

  String _headerTitle() {
    final s = _subjectController.text;
    if (s.toLowerCase().startsWith('re:')) return 'Reply';
    if (s.toLowerCase().startsWith('fwd:')) return 'Forward';
    return 'New Message';
  }
}

class _Header extends StatelessWidget {
  const _Header({
    required this.title,
    required this.isSending,
    required this.onClose,
    required this.onSend,
  });
  final String title;
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
          Text(title, style: AppTextStyles.titleMedium),
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
    required this.to,
    required this.cc,
    required this.bcc,
    required this.showCc,
    required this.showBcc,
    required this.onToChanged,
    required this.onCcChanged,
    required this.onBccChanged,
    required this.onShowCc,
    required this.onShowBcc,
    required this.subjectController,
    required this.bodyController,
    required this.errorMessage,
  });

  final String fromAddress;
  final List<String> to;
  final List<String> cc;
  final List<String> bcc;
  final bool showCc;
  final bool showBcc;
  final ValueChanged<List<String>> onToChanged;
  final ValueChanged<List<String>> onCcChanged;
  final ValueChanged<List<String>> onBccChanged;
  final VoidCallback onShowCc;
  final VoidCallback onShowBcc;
  final TextEditingController subjectController;
  final TextEditingController bodyController;
  final String? errorMessage;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      child: Column(
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
            trailing: (showCc && showBcc)
                ? null
                : Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (!showCc)
                        _MiniLink(label: 'Cc', onTap: onShowCc),
                      if (!showBcc) ...[
                        if (!showCc) const SizedBox(width: 8),
                        _MiniLink(label: 'Bcc', onTap: onShowBcc),
                      ],
                    ],
                  ),
            child: RecipientChipsField(
              values: to,
              onChanged: onToChanged,
              placeholder: 'name@domain.com',
            ),
          ),
          if (showCc) ...[
            const Divider(color: AppColors.border, height: 1),
            _Row(
              label: 'Cc',
              child: RecipientChipsField(
                values: cc,
                onChanged: onCcChanged,
                placeholder: 'Add Cc recipients…',
              ),
            ),
          ],
          if (showBcc) ...[
            const Divider(color: AppColors.border, height: 1),
            _Row(
              label: 'Bcc',
              child: RecipientChipsField(
                values: bcc,
                onChanged: onBccChanged,
                placeholder: 'Add Bcc recipients…',
              ),
            ),
          ],
          const Divider(color: AppColors.border, height: 1),
          _Row(
            label: 'Subject',
            child: TextField(
              controller: subjectController,
              cursorColor: AppColors.accent,
              style: GoogleFonts.inter(
                fontSize: 14,
                fontWeight: FontWeight.w500,
                color: AppColors.textPrimary,
              ),
              decoration: const InputDecoration(
                border: InputBorder.none,
                enabledBorder: InputBorder.none,
                focusedBorder: InputBorder.none,
                isDense: true,
                contentPadding: EdgeInsets.zero,
              ),
            ),
          ),
          const Divider(color: AppColors.border, height: 1),
          if (errorMessage != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
              child: Text(errorMessage!,
                  style: AppTextStyles.bodySmall
                      .copyWith(color: AppColors.danger)),
            ),
          // Body — multiline, no fixed height (the scroll view above
          // handles overflow). Min-height keeps the field tappable
          // even on a fresh compose.
          ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 280),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 16),
              child: TextField(
                controller: bodyController,
                maxLines: null,
                minLines: 8,
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
      ),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({required this.label, required this.child, this.trailing});
  final String label;
  final Widget child;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
      // ConstrainedBox keeps every row at a consistent minimum height
      // regardless of how many chips it contains — fixes the jumpy
      // chip-vs-empty input layout.
      child: ConstrainedBox(
        constraints: const BoxConstraints(minHeight: 28),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(
              width: 56,
              child: Padding(
                padding: const EdgeInsets.only(top: 6),
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
            ),
            Expanded(child: child),
            if (trailing != null)
              Padding(
                padding: const EdgeInsets.only(left: 8, top: 4),
                child: trailing,
              ),
          ],
        ),
      ),
    );
  }
}

class _MiniLink extends StatelessWidget {
  const _MiniLink({required this.label, required this.onTap});
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Text(
        label,
        style: GoogleFonts.jetBrainsMono(
          fontSize: 11,
          fontWeight: FontWeight.w600,
          color: AppColors.accent,
          letterSpacing: 0.4,
        ),
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
