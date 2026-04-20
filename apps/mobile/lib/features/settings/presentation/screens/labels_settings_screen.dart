import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/wm_app_bar.dart';
import '../../../labels/domain/label.dart';
import '../../../labels/presentation/providers/labels_providers.dart';
import '../../../mail/domain/email.dart';
import '../../../mail/presentation/providers/mail_providers.dart';

/// Labels settings — list + create + rename + recolor + delete. Mirrors
/// the `/settings/labels` page on web so the two clients stay in sync on
/// what a user can do. We don't expose "per-mailbox filter" here because
/// most users have a single mailbox; multi-mailbox accounts get a select
/// on the Create form instead.
class LabelsSettingsScreen extends ConsumerWidget {
  const LabelsSettingsScreen({super.key});

  /// Matches PRESET_COLORS in apps/web — keeping the palette identical
  /// means a label created on one client renders with the same colour
  /// everywhere.
  static const List<String> presetColors = [
    '#C5F135', // wm-accent
    '#3B82F6',
    '#A78BFA',
    '#F472B6',
    '#FB923C',
    '#FACC15',
    '#10B981',
    '#EF4444',
    '#94A3B8',
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final labelsAsync = ref.watch(labelsListProvider);
    final mailboxesAsync = ref.watch(mailboxesProvider);

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: const WmAppBar(title: 'Labels'),
      body: RefreshIndicator(
        color: AppColors.accent,
        backgroundColor: AppColors.surface,
        onRefresh: () async {
          ref.invalidate(labelsListProvider);
          await ref.read(labelsListProvider.future);
        },
        child: mailboxesAsync.when(
          loading: () => const Center(
            child: CircularProgressIndicator(color: AppColors.accent),
          ),
          error: (err, _) => _ErrorState(message: '$err'),
          data: (mailboxes) => labelsAsync.when(
            loading: () => const Center(
              child: CircularProgressIndicator(color: AppColors.accent),
            ),
            error: (err, _) => _ErrorState(message: '$err'),
            data: (labels) => _Body(mailboxes: mailboxes, labels: labels),
          ),
        ),
      ),
    );
  }
}

class _Body extends ConsumerWidget {
  const _Body({required this.mailboxes, required this.labels});
  final List<Mailbox> mailboxes;
  final List<EmailLabel> labels;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return ListView(
      // physics: always so pull-to-refresh works on an empty list.
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
      children: [
        if (mailboxes.isEmpty)
          _NoMailboxWarning()
        else ...[
          _CreateCard(mailboxes: mailboxes),
          const SizedBox(height: 20),
        ],
        _LabelsListCard(labels: labels),
      ],
    );
  }
}

class _NoMailboxWarning extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.dangerSubtle,
        border: Border.all(color: AppColors.danger.withValues(alpha: 0.5)),
      ),
      child: Text(
        'You need at least one verified mailbox before creating labels. '
        'Set one up under Settings \u2192 Domains.',
        style: GoogleFonts.jetBrainsMono(
          fontSize: 12,
          color: AppColors.textSecondary,
        ),
      ),
    );
  }
}

class _CreateCard extends ConsumerStatefulWidget {
  const _CreateCard({required this.mailboxes});
  final List<Mailbox> mailboxes;

  @override
  ConsumerState<_CreateCard> createState() => _CreateCardState();
}

class _CreateCardState extends ConsumerState<_CreateCard> {
  final _nameCtrl = TextEditingController();
  String _color = LabelsSettingsScreen.presetColors.first;
  late String _mailboxId;
  bool _submitting = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _mailboxId = widget.mailboxes.first.id;
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final name = _nameCtrl.text.trim();
    if (name.isEmpty || _submitting) return;
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      final repo = await ref.read(labelsRepositoryProvider.future);
      await repo.create(name: name, color: _color, mailboxId: _mailboxId);
      ref.invalidate(labelsListProvider);
      if (!mounted) return;
      _nameCtrl.clear();
    } catch (err) {
      if (!mounted) return;
      setState(() => _error = 'Failed to create label: $err');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return _Card(
      title: 'Create label',
      description: 'Group emails by topic, project, or anything else.',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          TextField(
            controller: _nameCtrl,
            enabled: !_submitting,
            style: GoogleFonts.inter(fontSize: 14, color: AppColors.textPrimary),
            cursorColor: AppColors.accent,
            onSubmitted: (_) => _submit(),
            decoration: InputDecoration(
              hintText: 'Priority',
              hintStyle:
                  GoogleFonts.inter(fontSize: 14, color: AppColors.textMuted),
              filled: true,
              fillColor: AppColors.surface,
              contentPadding: const EdgeInsets.symmetric(
                horizontal: 12,
                vertical: 12,
              ),
              border: const OutlineInputBorder(
                borderRadius: BorderRadius.zero,
                borderSide: BorderSide(color: AppColors.border),
              ),
              enabledBorder: const OutlineInputBorder(
                borderRadius: BorderRadius.zero,
                borderSide: BorderSide(color: AppColors.border),
              ),
              focusedBorder: const OutlineInputBorder(
                borderRadius: BorderRadius.zero,
                borderSide: BorderSide(color: AppColors.accent),
              ),
            ),
          ),
          if (widget.mailboxes.length > 1) ...[
            const SizedBox(height: 12),
            Text(
              'MAILBOX',
              style: GoogleFonts.jetBrainsMono(
                fontSize: 10,
                fontWeight: FontWeight.w700,
                color: AppColors.textMuted,
                letterSpacing: 0.5,
              ),
            ),
            const SizedBox(height: 6),
            DropdownButtonFormField<String>(
              initialValue: _mailboxId,
              dropdownColor: AppColors.surface,
              style: GoogleFonts.inter(
                fontSize: 13,
                color: AppColors.textPrimary,
              ),
              decoration: const InputDecoration(
                filled: true,
                fillColor: AppColors.surface,
                contentPadding:
                    EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.zero,
                  borderSide: BorderSide(color: AppColors.border),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.zero,
                  borderSide: BorderSide(color: AppColors.border),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.zero,
                  borderSide: BorderSide(color: AppColors.accent),
                ),
              ),
              items: [
                for (final m in widget.mailboxes)
                  DropdownMenuItem(value: m.id, child: Text(m.address)),
              ],
              onChanged: _submitting
                  ? null
                  : (v) {
                      if (v != null) setState(() => _mailboxId = v);
                    },
            ),
          ],
          const SizedBox(height: 14),
          Text(
            'COLOR',
            style: GoogleFonts.jetBrainsMono(
              fontSize: 10,
              fontWeight: FontWeight.w700,
              color: AppColors.textMuted,
              letterSpacing: 0.5,
            ),
          ),
          const SizedBox(height: 8),
          _ColorPalette(
            selected: _color,
            onPick: (c) => setState(() => _color = c),
          ),
          const SizedBox(height: 14),
          Align(
            alignment: Alignment.centerRight,
            child: GestureDetector(
              onTap: _submit,
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 10,
                ),
                decoration: BoxDecoration(
                  color: _submitting ? AppColors.accentDim : AppColors.accent,
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (_submitting)
                      const SizedBox(
                        height: 14,
                        width: 14,
                        child: CircularProgressIndicator(
                          strokeWidth: 1.5,
                          valueColor:
                              AlwaysStoppedAnimation(AppColors.background),
                        ),
                      )
                    else
                      const Icon(Icons.add,
                          size: 14, color: AppColors.background),
                    const SizedBox(width: 6),
                    Text(
                      'CREATE',
                      style: GoogleFonts.inter(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: AppColors.background,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          if (_error != null) ...[
            const SizedBox(height: 8),
            Text(
              _error!,
              style: GoogleFonts.jetBrainsMono(
                fontSize: 11,
                color: AppColors.danger,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _LabelsListCard extends ConsumerWidget {
  const _LabelsListCard({required this.labels});
  final List<EmailLabel> labels;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return _Card(
      title: 'Your labels (${labels.length})',
      description:
          'Tap a name to rename. Tap the dot to change colour. Use the trash icon to delete.',
      child: labels.isEmpty
          ? Padding(
              padding: const EdgeInsets.symmetric(vertical: 12),
              child: Text(
                'No labels yet. Create one above to start organizing.',
                style: GoogleFonts.jetBrainsMono(
                  fontSize: 11,
                  color: AppColors.textMuted,
                ),
              ),
            )
          : Column(
              children: [
                for (var i = 0; i < labels.length; i++) ...[
                  _LabelRow(label: labels[i]),
                  if (i != labels.length - 1)
                    const Divider(height: 1, color: AppColors.border),
                ],
              ],
            ),
    );
  }
}

class _LabelRow extends ConsumerStatefulWidget {
  const _LabelRow({required this.label});
  final EmailLabel label;

  @override
  ConsumerState<_LabelRow> createState() => _LabelRowState();
}

class _LabelRowState extends ConsumerState<_LabelRow> {
  bool _editing = false;
  bool _showColors = false;
  late TextEditingController _ctrl;
  final FocusNode _focus = FocusNode();
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _ctrl = TextEditingController(text: widget.label.name);
    _focus.addListener(() {
      if (!_focus.hasFocus && _editing) _commitName();
    });
  }

  @override
  void didUpdateWidget(covariant _LabelRow oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!_editing && widget.label.name != _ctrl.text) {
      _ctrl.text = widget.label.name;
    }
  }

  @override
  void dispose() {
    _ctrl.dispose();
    _focus.dispose();
    super.dispose();
  }

  Future<void> _commitName() async {
    final next = _ctrl.text.trim();
    setState(() => _editing = false);
    if (next.isEmpty || next == widget.label.name) {
      _ctrl.text = widget.label.name;
      return;
    }
    setState(() => _busy = true);
    try {
      final repo = await ref.read(labelsRepositoryProvider.future);
      await repo.update(widget.label.id, name: next);
      ref.invalidate(labelsListProvider);
    } catch (err) {
      if (!mounted) return;
      _ctrl.text = widget.label.name;
      _showSnack('Rename failed: $err');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _pickColor(String color) async {
    setState(() {
      _showColors = false;
      _busy = true;
    });
    try {
      final repo = await ref.read(labelsRepositoryProvider.future);
      await repo.update(widget.label.id, color: color);
      ref.invalidate(labelsListProvider);
    } catch (err) {
      if (!mounted) return;
      _showSnack('Colour change failed: $err');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _confirmDelete() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.surface,
        title: Text(
          'Delete "${widget.label.name}"?',
          style: GoogleFonts.inter(
            color: AppColors.textPrimary,
            fontSize: 16,
            fontWeight: FontWeight.w700,
          ),
        ),
        content: Text(
          'Existing emails will lose this tag. This can\'t be undone.',
          style: GoogleFonts.inter(
            color: AppColors.textSecondary,
            fontSize: 13,
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text(
              'CANCEL',
              style: GoogleFonts.jetBrainsMono(
                color: AppColors.textSecondary,
                fontSize: 12,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(
              'DELETE',
              style: GoogleFonts.jetBrainsMono(
                color: AppColors.danger,
                fontSize: 12,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ],
      ),
    );
    if (ok != true) return;
    setState(() => _busy = true);
    try {
      final repo = await ref.read(labelsRepositoryProvider.future);
      await repo.delete(widget.label.id);
      ref.invalidate(labelsListProvider);
    } catch (err) {
      if (!mounted) return;
      _showSnack('Delete failed: $err');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _showSnack(String msg) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(msg), backgroundColor: AppColors.danger),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 10),
          child: Row(
            children: [
              // Colour swatch — tap to expand the palette.
              GestureDetector(
                onTap: _busy ? null : () => setState(() => _showColors = !_showColors),
                child: Container(
                  height: 16,
                  width: 16,
                  decoration: BoxDecoration(
                    color: widget.label.swatch,
                    border: Border.all(color: AppColors.border),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _editing
                    ? TextField(
                        controller: _ctrl,
                        focusNode: _focus,
                        autofocus: true,
                        enabled: !_busy,
                        style: GoogleFonts.inter(
                          fontSize: 14,
                          color: AppColors.textPrimary,
                        ),
                        cursorColor: AppColors.accent,
                        onSubmitted: (_) => _commitName(),
                        decoration: const InputDecoration(
                          isDense: true,
                          contentPadding:
                              EdgeInsets.symmetric(vertical: 6),
                          border: UnderlineInputBorder(
                            borderSide: BorderSide(color: AppColors.accent),
                          ),
                          enabledBorder: UnderlineInputBorder(
                            borderSide: BorderSide(color: AppColors.accent),
                          ),
                          focusedBorder: UnderlineInputBorder(
                            borderSide: BorderSide(color: AppColors.accent),
                          ),
                        ),
                      )
                    : GestureDetector(
                        onTap: _busy
                            ? null
                            : () {
                                setState(() => _editing = true);
                                WidgetsBinding.instance.addPostFrameCallback(
                                  (_) => _focus.requestFocus(),
                                );
                              },
                        child: Text(
                          widget.label.name,
                          style: GoogleFonts.inter(
                            fontSize: 14,
                            color: AppColors.textPrimary,
                          ),
                        ),
                      ),
              ),
              if (_busy)
                const SizedBox(
                  height: 14,
                  width: 14,
                  child: CircularProgressIndicator(
                    strokeWidth: 1.5,
                    valueColor: AlwaysStoppedAnimation(AppColors.textMuted),
                  ),
                )
              else
                IconButton(
                  visualDensity: VisualDensity.compact,
                  onPressed: _confirmDelete,
                  icon: const Icon(
                    Icons.delete_outline,
                    size: 18,
                    color: AppColors.textMuted,
                  ),
                  tooltip: 'Delete label',
                ),
            ],
          ),
        ),
        if (_showColors)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: _ColorPalette(
              selected: widget.label.color,
              onPick: _pickColor,
            ),
          ),
      ],
    );
  }
}

class _ColorPalette extends StatelessWidget {
  const _ColorPalette({required this.selected, required this.onPick});
  final String selected;
  final ValueChanged<String> onPick;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        for (final c in LabelsSettingsScreen.presetColors)
          GestureDetector(
            onTap: () => onPick(c),
            child: Container(
              height: 26,
              width: 26,
              decoration: BoxDecoration(
                color: _hexToColor(c),
                border: Border.all(
                  color: c.toLowerCase() == selected.toLowerCase()
                      ? AppColors.textPrimary
                      : Colors.transparent,
                  width: 2,
                ),
              ),
            ),
          ),
      ],
    );
  }
}

Color _hexToColor(String hex) {
  final h = hex.replaceFirst('#', '');
  if (h.length != 6) return AppColors.textMuted;
  return Color(int.parse('FF$h', radix: 16));
}

/// Generic section wrapper — title + description + child, matching the
/// `<SettingsCard>` pattern on web so the two clients read similarly.
class _Card extends StatelessWidget {
  const _Card({
    required this.title,
    required this.description,
    required this.child,
  });
  final String title;
  final String description;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: GoogleFonts.inter(
              fontSize: 15,
              fontWeight: FontWeight.w700,
              color: AppColors.textPrimary,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            description,
            style: GoogleFonts.inter(
              fontSize: 12,
              color: AppColors.textSecondary,
            ),
          ),
          const SizedBox(height: 14),
          child,
        ],
      ),
    );
  }
}

class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.message});
  final String message;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Text(
          message,
          style: GoogleFonts.jetBrainsMono(
            fontSize: 12,
            color: AppColors.danger,
          ),
        ),
      ),
    );
  }
}
