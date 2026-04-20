import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../../core/theme/app_colors.dart';

/// One row of the compose form (To / Cc / Bcc) showing every committed
/// recipient as a real chip plus an inline editor for the next one.
///
/// Why this widget rather than a plain TextField:
/// 1. Chips communicate "this address is locked in" — backspace
///    removes the last chip; tap-X removes any chip.
/// 2. Comma, semicolon, space, enter, and tab all commit the buffer.
///    Tapping outside the field also commits (so users don't lose
///    half-typed addresses).
/// 3. The row uses Wrap, so adding chips grows the row vertically
///    instead of pushing the input off-screen — no horizontal jitter.
/// 4. Phase E will hook the `onQueryChanged` callback to a
///    `/contacts/search` autocomplete dropdown without touching this
///    widget's structure.
class RecipientChipsField extends StatefulWidget {
  const RecipientChipsField({
    super.key,
    required this.values,
    required this.onChanged,
    this.placeholder = 'name@domain.com',
    this.onQueryChanged,
    this.focusNode,
  });

  /// Currently committed recipient addresses.
  final List<String> values;

  /// Fires whenever the committed list changes (chip added/removed).
  final ValueChanged<List<String>> onChanged;

  /// Placeholder shown only when there are no chips.
  final String placeholder;

  /// Optional hook for autocomplete — fires on each keystroke with
  /// the current uncommitted text. Phase E uses this.
  final ValueChanged<String>? onQueryChanged;

  /// Optional external focus node so a parent can shift focus
  /// programmatically (e.g. tab from To → Subject).
  final FocusNode? focusNode;

  @override
  State<RecipientChipsField> createState() => _RecipientChipsFieldState();
}

class _RecipientChipsFieldState extends State<RecipientChipsField> {
  late final TextEditingController _controller;
  late final FocusNode _focusNode;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController();
    _focusNode = widget.focusNode ?? FocusNode();
    _focusNode.addListener(_handleFocusChange);
  }

  @override
  void dispose() {
    _controller.dispose();
    if (widget.focusNode == null) {
      _focusNode.dispose();
    } else {
      _focusNode.removeListener(_handleFocusChange);
    }
    super.dispose();
  }

  void _handleFocusChange() {
    if (!_focusNode.hasFocus) {
      // Commit any partially-typed address when focus leaves so the
      // user doesn't silently lose it on Send.
      final pending = _controller.text.trim();
      if (pending.isNotEmpty) {
        _commit(pending);
      }
    }
  }

  /// Commit a buffer to a chip if it parses as a plausible address.
  /// We accept anything with an `@` to keep the UX permissive — the
  /// API does the strict validation on send.
  void _commit(String raw) {
    final trimmed = raw.trim().replaceAll(RegExp(r'[,;]+$'), '').trim();
    if (trimmed.isEmpty) return;
    if (!trimmed.contains('@')) {
      // Don't drop the buffer — let the user fix the typo. But also
      // don't add it as a chip.
      return;
    }
    if (widget.values.contains(trimmed)) {
      _controller.clear();
      return;
    }
    widget.onChanged([...widget.values, trimmed]);
    _controller.clear();
    widget.onQueryChanged?.call('');
  }

  void _remove(String value) {
    widget.onChanged(widget.values.where((v) => v != value).toList());
  }

  KeyEventResult _onKey(FocusNode node, KeyEvent event) {
    if (event is! KeyDownEvent) return KeyEventResult.ignored;
    final key = event.logicalKey;
    if (key == LogicalKeyboardKey.backspace &&
        _controller.text.isEmpty &&
        widget.values.isNotEmpty) {
      // Backspace on an empty buffer pops the last chip — same
      // behavior as Gmail / Slack / every other chip input.
      _remove(widget.values.last);
      return KeyEventResult.handled;
    }
    if (key == LogicalKeyboardKey.enter ||
        key == LogicalKeyboardKey.tab ||
        (event.character != null &&
            (event.character == ',' || event.character == ';'))) {
      final pending = _controller.text;
      if (pending.trim().isNotEmpty) {
        _commit(pending);
        return KeyEventResult.handled;
      }
    }
    return KeyEventResult.ignored;
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      // Tap anywhere in the row hands focus to the underlying input
      // so the user doesn't have to aim at the small text region.
      behavior: HitTestBehavior.opaque,
      onTap: _focusNode.requestFocus,
      child: Wrap(
        spacing: 6,
        runSpacing: 6,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          for (final v in widget.values)
            _Chip(label: v, onRemove: () => _remove(v)),
          // The input gets a min width so the placeholder is readable
          // even when there are several chips already.
          ConstrainedBox(
            constraints: const BoxConstraints(minWidth: 140),
            child: IntrinsicWidth(
              child: Focus(
                onKeyEvent: _onKey,
                child: TextField(
                  controller: _controller,
                  focusNode: _focusNode,
                  cursorColor: AppColors.accent,
                  style: GoogleFonts.jetBrainsMono(
                    fontSize: 13,
                    color: AppColors.textPrimary,
                  ),
                  decoration: InputDecoration(
                    hintText:
                        widget.values.isEmpty ? widget.placeholder : null,
                    hintStyle: GoogleFonts.jetBrainsMono(
                      fontSize: 13,
                      color: AppColors.textTertiary,
                    ),
                    border: InputBorder.none,
                    enabledBorder: InputBorder.none,
                    focusedBorder: InputBorder.none,
                    isDense: true,
                    contentPadding: EdgeInsets.zero,
                    filled: false,
                  ),
                  onChanged: (value) {
                    // Trailing comma / semicolon commits without the
                    // key handler — handles paste-with-trailing-sep
                    // and on-screen keyboards that don't fire keys.
                    if (value.endsWith(',') || value.endsWith(';')) {
                      _commit(value);
                      return;
                    }
                    widget.onQueryChanged?.call(value);
                  },
                  onSubmitted: (value) {
                    if (value.trim().isNotEmpty) _commit(value);
                  },
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({required this.label, required this.onRemove});

  final String label;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.accentDim,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(8, 4, 4, 4),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              label,
              style: GoogleFonts.jetBrainsMono(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: AppColors.accent,
              ),
            ),
            const SizedBox(width: 4),
            InkWell(
              onTap: onRemove,
              child: const Padding(
                padding: EdgeInsets.all(2),
                child:
                    Icon(Icons.close, size: 12, color: AppColors.accent),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
