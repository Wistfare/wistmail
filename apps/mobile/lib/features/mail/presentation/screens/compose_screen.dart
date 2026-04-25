import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../../../core/local/compose_drafts_store.dart';
import '../../../../core/local/local_providers.dart';
import '../../../../core/theme/app_colors.dart';
import '../../data/mail_actions.dart';
import '../../domain/compose_args.dart';
import '../../domain/email.dart';
import '../providers/mail_providers.dart';
import '../widgets/recipient_chips_field.dart';

/// MobileV3 Compose — matches `design.lib.pen` node `TZBlh`.
///
/// Supports new compose, reply, reply-all and forward via
/// `ComposeArgs` (passed from the router via `extra`).
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

  Timer? _autosaveTimer;
  String? _draftMailboxId;
  bool _restoreAttempted = false;
  DateTime? _scheduledAt;

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
    _subjectController.addListener(_scheduleAutosave);
    _bodyController.addListener(_scheduleAutosave);
  }

  @override
  void dispose() {
    _autosaveTimer?.cancel();
    _subjectController.removeListener(_scheduleAutosave);
    _bodyController.removeListener(_scheduleAutosave);
    _subjectController.dispose();
    _bodyController.dispose();
    super.dispose();
  }

  void _scheduleAutosave() {
    _autosaveTimer?.cancel();
    _autosaveTimer = Timer(const Duration(milliseconds: 800), _persistDraft);
  }

  bool get _localStoreReady =>
      ref.read(composeDraftsStoreProvider) is AsyncData;

  Future<void> _persistDraft() async {
    final mailboxId = _draftMailboxId;
    if (mailboxId == null || !_localStoreReady) return;
    try {
      final store = await ref.read(composeDraftsStoreProvider.future);
      await store.save(
        ComposeDraftRow(
          mailboxId: mailboxId,
          toAddresses: _to,
          cc: _cc,
          bcc: _bcc,
          subject: _subjectController.text,
          body: _bodyController.text,
          inReplyTo: widget.args.inReplyTo,
          scheduledAt: _scheduledAt,
          updatedAt: DateTime.now(),
        ),
      );
    } catch (_) {}
  }

  Future<void> _restoreDraftFor(String mailboxId) async {
    if (_restoreAttempted) return;
    _restoreAttempted = true;
    _draftMailboxId = mailboxId;

    final hasPrefilled =
        widget.args.toAddresses.isNotEmpty ||
        widget.args.subject.isNotEmpty ||
        widget.args.body.isNotEmpty;
    if (hasPrefilled) return;
    if (!_localStoreReady) return;

    ComposeDraftRow? row;
    try {
      final store = await ref.read(composeDraftsStoreProvider.future);
      row = await store.load(mailboxId);
    } catch (_) {
      return;
    }
    if (row == null || !mounted) return;
    final restored = row;
    setState(() {
      _to = List.of(restored.toAddresses);
      _cc = List.of(restored.cc);
      _bcc = List.of(restored.bcc);
      _showCc = _cc.isNotEmpty;
      _showBcc = _bcc.isNotEmpty;
      _subjectController.text = restored.subject;
      _bodyController.text = restored.body;
      _scheduledAt = restored.scheduledAt;
    });
  }

  Future<void> _clearPersistedDraft() async {
    final mailboxId = _draftMailboxId;
    if (mailboxId == null || !_localStoreReady) return;
    try {
      final store = await ref.read(composeDraftsStoreProvider.future);
      await store.clear(mailboxId);
    } catch (_) {}
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
      scheduledAt: _scheduledAt,
    );
    final actions = ref.read(mailActionsProvider).valueOrNull;
    try {
      if (actions != null) {
        await actions.send(draft);
      } else {
        final repo = await ref.read(mailRepositoryProvider.future);
        await repo.compose(draft);
      }
      _autosaveTimer?.cancel();
      await _clearPersistedDraft();
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

  String _format(Object err) {
    final message = err.toString();
    if (message.startsWith('Exception: ')) {
      return message.substring('Exception: '.length);
    }
    return message;
  }

  @override
  Widget build(BuildContext context) {
    final mailboxes = ref.watch(mailboxesProvider);

    return PopScope(
      canPop: true,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) return;
        _autosaveTimer?.cancel();
        _persistDraft();
      },
      child: Scaffold(
        backgroundColor: AppColors.background,
        body: SafeArea(
          child: Column(
            children: [
              _ComposeTopBar(
                isSending: _isSending,
                scheduledAt: _scheduledAt,
                onClose: () => context.pop(),
                onSchedule: () async {
                  final when = await _pickScheduledTime(context);
                  if (!mounted) return;
                  setState(() => _scheduledAt = when);
                },
                onSend: () {
                  FocusManager.instance.primaryFocus?.unfocus();
                  Future.microtask(() {
                    if (!mounted) return;
                    mailboxes.whenOrNull(
                      data: (list) => list.isEmpty ? null : _send(list.first),
                    );
                  });
                },
              ),
              Expanded(
                child: mailboxes.when(
                  data: (list) {
                    if (list.isEmpty) {
                      return const _NoMailbox();
                    }
                    WidgetsBinding.instance.addPostFrameCallback((_) {
                      _restoreDraftFor(list.first.id);
                    });
                    return _ComposeBody(
                      fromAddress: list.first.address,
                      to: _to,
                      cc: _cc,
                      bcc: _bcc,
                      showCc: _showCc,
                      showBcc: _showBcc,
                      onToChanged: (v) {
                        setState(() => _to = v);
                        _scheduleAutosave();
                      },
                      onCcChanged: (v) {
                        setState(() => _cc = v);
                        _scheduleAutosave();
                      },
                      onBccChanged: (v) {
                        setState(() => _bcc = v);
                        _scheduleAutosave();
                      },
                      onShowCcBcc: () =>
                          setState(() => _showCc = _showBcc = true),
                      onHideCc: () {
                        setState(() {
                          _cc = const [];
                          _showCc = false;
                        });
                        _scheduleAutosave();
                      },
                      onHideBcc: () {
                        setState(() {
                          _bcc = const [];
                          _showBcc = false;
                        });
                        _scheduleAutosave();
                      },
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
                        strokeWidth: 2,
                        color: AppColors.accent,
                      ),
                    ),
                  ),
                  error: (err, _) => Center(
                    child: Padding(
                      padding: const EdgeInsets.all(32),
                      child: Text(
                        _format(err),
                        style: GoogleFonts.jetBrainsMono(
                          color: AppColors.textSecondary,
                          fontSize: 12,
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Top bar — pen `UTlKJ` (padding [8,12], space_between).
///   Left: close btn 40×40 circle surface (X icon 18).
///   Center: "NEW MESSAGE" 10/700 mono letterSpacing 1.5 secondary.
///   Right (gap 6): attach, schedule (clock-3),
///   SEND pill (accent, cornerRadius 20, height 40, padding [0,14,0,16],
///   gap 6, icon send 14 + "SEND" 11/700 letterSpacing 1.5 black).
class _ComposeTopBar extends StatelessWidget {
  const _ComposeTopBar({
    required this.isSending,
    required this.scheduledAt,
    required this.onClose,
    required this.onSend,
    required this.onSchedule,
  });
  final bool isSending;
  final DateTime? scheduledAt;
  final VoidCallback onClose;
  final VoidCallback onSend;
  final VoidCallback onSchedule;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      child: Row(
        children: [
          _CircleBtn(icon: LucideIcons.arrowLeft, onTap: onClose),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.only(left: 18),
              child: Text(
                'NEW MESSAGE',
                style: GoogleFonts.jetBrainsMono(
                  color: AppColors.textSecondary,
                  fontSize: 10,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 1.5,
                ),
              ),
            ),
          ),
          _CircleBtn(icon: LucideIcons.paperclip, onTap: () {}),
          const SizedBox(width: 6),
          _CircleBtn(
            icon: LucideIcons.clock3,
            onTap: onSchedule,
            iconColor: scheduledAt != null
                ? AppColors.accent
                : AppColors.textPrimary,
          ),
          const SizedBox(width: 6),
          _SendPill(
            isSending: isSending,
            label: scheduledAt == null ? 'SEND' : 'SCHED',
            onTap: onSend,
          ),
        ],
      ),
    );
  }
}

class _CircleBtn extends StatelessWidget {
  const _CircleBtn({
    required this.icon,
    required this.onTap,
    this.iconColor = AppColors.textPrimary,
  });
  final IconData icon;
  final VoidCallback onTap;
  final Color iconColor;
  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      customBorder: const CircleBorder(),
      child: Container(
        width: 40,
        height: 40,
        decoration: const BoxDecoration(
          color: AppColors.surface,
          shape: BoxShape.circle,
        ),
        alignment: Alignment.center,
        child: Icon(icon, size: 18, color: iconColor),
      ),
    );
  }
}

class _SendPill extends StatelessWidget {
  const _SendPill({
    required this.isSending,
    required this.label,
    required this.onTap,
  });
  final bool isSending;
  final String label;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: isSending ? null : onTap,
      borderRadius: BorderRadius.circular(20),
      child: Container(
        height: 40,
        padding: const EdgeInsets.fromLTRB(16, 0, 14, 0),
        decoration: BoxDecoration(
          color: AppColors.accent,
          borderRadius: BorderRadius.circular(20),
        ),
        alignment: Alignment.center,
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            isSending
                ? const SizedBox(
                    width: 14,
                    height: 14,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: AppColors.background,
                    ),
                  )
                : const Icon(
                    LucideIcons.send,
                    size: 14,
                    color: AppColors.background,
                  ),
            const SizedBox(width: 6),
            Text(
              label,
              style: GoogleFonts.jetBrainsMono(
                color: AppColors.background,
                fontSize: 11,
                fontWeight: FontWeight.w700,
                letterSpacing: 1.5,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ComposeBody extends StatelessWidget {
  const _ComposeBody({
    required this.fromAddress,
    required this.to,
    required this.cc,
    required this.bcc,
    required this.showCc,
    required this.showBcc,
    required this.onToChanged,
    required this.onCcChanged,
    required this.onBccChanged,
    required this.onShowCcBcc,
    required this.onHideCc,
    required this.onHideBcc,
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
  final VoidCallback onShowCcBcc;
  final VoidCallback onHideCc;
  final VoidCallback onHideBcc;
  final TextEditingController subjectController;
  final TextEditingController bodyController;
  final String? errorMessage;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Fields block — pen `eU0n4` (padding [6,20,0,20]).
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Column(
              children: [
                _FromRow(fromAddress: fromAddress),
                const _Divider(),
                _ToRow(
                  to: to,
                  showCcBcc: !(showCc || showBcc),
                  onToChanged: onToChanged,
                  onShowCcBcc: onShowCcBcc,
                ),
                if (showCc) ...[
                  const _Divider(),
                  _SimpleRow(
                    label: 'CC',
                    onRemove: onHideCc,
                    child: RecipientChipsField(
                      values: cc,
                      onChanged: onCcChanged,
                      placeholder: 'Cc recipients…',
                    ),
                  ),
                ],
                if (showBcc) ...[
                  const _Divider(),
                  _SimpleRow(
                    label: 'BCC',
                    onRemove: onHideBcc,
                    child: RecipientChipsField(
                      values: bcc,
                      onChanged: onBccChanged,
                      placeholder: 'Bcc recipients…',
                    ),
                  ),
                ],
                const _Divider(),
                _SubjectRow(controller: subjectController),
                const _Divider(),
              ],
            ),
          ),
          if (errorMessage != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
              child: Text(
                errorMessage!,
                style: GoogleFonts.jetBrainsMono(
                  color: AppColors.danger,
                  fontSize: 12,
                ),
              ),
            ),
          // Body — pen `ZvhaH` (padding [16,20,0,20], gap 10).
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
            child: TextField(
              controller: bodyController,
              maxLines: null,
              minLines: 12,
              cursorColor: AppColors.accent,
              style: GoogleFonts.jetBrainsMono(
                fontSize: 14,
                color: AppColors.textPrimary,
                height: 1.5,
              ),
              decoration: InputDecoration(
                hintText: 'Write your message…',
                hintStyle: GoogleFonts.jetBrainsMono(
                  fontSize: 14,
                  color: AppColors.textTertiary,
                ),
                filled: false,
                fillColor: Colors.transparent,
                border: InputBorder.none,
                enabledBorder: InputBorder.none,
                focusedBorder: InputBorder.none,
                isDense: true,
                contentPadding: EdgeInsets.zero,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// 1px full-width divider in the fields block.
class _Divider extends StatelessWidget {
  const _Divider();
  @override
  Widget build(BuildContext context) {
    return Container(height: 1, color: AppColors.border);
  }
}

/// FROM row — 48-wide mono label + accent-avatar pill (pen `4ts9S`).
class _FromRow extends StatelessWidget {
  const _FromRow({required this.fromAddress});
  final String fromAddress;
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          const _FieldLabel(label: 'FROM'),
          const SizedBox(width: 10),
          _FromPill(address: fromAddress),
        ],
      ),
    );
  }
}

class _FromPill extends StatelessWidget {
  const _FromPill({required this.address});
  final String address;
  @override
  Widget build(BuildContext context) {
    // Pen `b9D1Y`: cornerRadius 14, padding [5,10,5,8] (t,r,b,l), gap 6.
    return Container(
      padding: const EdgeInsets.fromLTRB(8, 5, 10, 5),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 18,
            height: 18,
            decoration: const BoxDecoration(
              color: AppColors.accent,
              shape: BoxShape.circle,
            ),
            alignment: Alignment.center,
            child: Text(
              address.isEmpty ? 'W' : address[0].toUpperCase(),
              style: GoogleFonts.jetBrainsMono(
                color: AppColors.background,
                fontSize: 10,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          const SizedBox(width: 6),
          Text(
            address,
            style: GoogleFonts.jetBrainsMono(
              color: AppColors.textPrimary,
              fontSize: 12,
            ),
          ),
          const SizedBox(width: 6),
          const Icon(
            LucideIcons.chevronDown,
            size: 12,
            color: AppColors.textSecondary,
          ),
        ],
      ),
    );
  }
}

/// TO row with recipient chips + Cc/Bcc link.
class _ToRow extends StatelessWidget {
  const _ToRow({
    required this.to,
    required this.showCcBcc,
    required this.onToChanged,
    required this.onShowCcBcc,
  });
  final List<String> to;
  final bool showCcBcc;
  final ValueChanged<List<String>> onToChanged;
  final VoidCallback onShowCcBcc;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Padding(
            padding: EdgeInsets.only(top: 4),
            child: _FieldLabel(label: 'TO'),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: RecipientChipsField(
              values: to,
              onChanged: onToChanged,
              placeholder: 'name@domain.com',
            ),
          ),
          if (showCcBcc) ...[
            const SizedBox(width: 8),
            InkWell(
              onTap: onShowCcBcc,
              child: Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Text(
                  'Cc/Bcc',
                  style: GoogleFonts.jetBrainsMono(
                    color: AppColors.textSecondary,
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// Generic row used for CC/BCC follow-ups.
class _SimpleRow extends StatelessWidget {
  const _SimpleRow({required this.label, required this.child, this.onRemove});
  final String label;
  final Widget child;
  final VoidCallback? onRemove;
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: _FieldLabel(label: label),
          ),
          const SizedBox(width: 10),
          Expanded(child: child),
          if (onRemove != null) ...[
            const SizedBox(width: 8),
            InkWell(
              onTap: onRemove,
              customBorder: const CircleBorder(),
              child: const Padding(
                padding: EdgeInsets.all(4),
                child: Icon(
                  LucideIcons.x,
                  size: 14,
                  color: AppColors.textSecondary,
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// SUBJ row — 15/700 bold subject text.
class _SubjectRow extends StatelessWidget {
  const _SubjectRow({required this.controller});
  final TextEditingController controller;
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          const _FieldLabel(label: 'SUBJ'),
          const SizedBox(width: 10),
          Expanded(
            child: TextField(
              controller: controller,
              cursorColor: AppColors.accent,
              style: GoogleFonts.jetBrainsMono(
                color: AppColors.textPrimary,
                fontSize: 15,
                fontWeight: FontWeight.w700,
              ),
              decoration: InputDecoration(
                hintText: 'Subject',
                hintStyle: GoogleFonts.jetBrainsMono(
                  color: AppColors.textTertiary,
                  fontSize: 15,
                  fontWeight: FontWeight.w700,
                ),
                filled: false,
                fillColor: Colors.transparent,
                border: InputBorder.none,
                enabledBorder: InputBorder.none,
                focusedBorder: InputBorder.none,
                isDense: true,
                contentPadding: EdgeInsets.zero,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Fixed-width field label (pen: 48w, 10/700, letterSpacing 1, secondary).
class _FieldLabel extends StatelessWidget {
  const _FieldLabel({required this.label});
  final String label;
  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 48,
      child: Text(
        label,
        style: GoogleFonts.jetBrainsMono(
          color: AppColors.textSecondary,
          fontSize: 10,
          fontWeight: FontWeight.w700,
          letterSpacing: 1,
        ),
      ),
    );
  }
}

class _NoMailbox extends StatelessWidget {
  const _NoMailbox();
  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Text(
          'No mailbox set up yet. Configure one on the web app to send mail.',
          textAlign: TextAlign.center,
          style: GoogleFonts.jetBrainsMono(
            color: AppColors.textSecondary,
            fontSize: 12,
          ),
        ),
      ),
    );
  }
}

/// Two-step date + time picker for scheduled sends. Returns null if
/// the user cancels, or if the combined value falls in the past.
Future<DateTime?> _pickScheduledTime(BuildContext context) async {
  final now = DateTime.now();
  final date = await showDatePicker(
    context: context,
    initialDate: now.add(const Duration(hours: 1)),
    firstDate: now,
    lastDate: now.add(const Duration(days: 365)),
  );
  if (date == null || !context.mounted) return null;
  final time = await showTimePicker(
    context: context,
    initialTime: TimeOfDay.fromDateTime(now.add(const Duration(hours: 1))),
  );
  if (time == null) return null;
  final scheduled = DateTime(
    date.year,
    date.month,
    date.day,
    time.hour,
    time.minute,
  );
  if (scheduled.isBefore(DateTime.now())) return null;
  return scheduled;
}
