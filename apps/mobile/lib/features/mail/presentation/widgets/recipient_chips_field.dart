import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../../core/network/providers.dart';
import '../../../../core/theme/app_colors.dart';
import '../../data/contacts_search.dart';

/// One row of the compose form (To / Cc / Bcc) showing every committed
/// recipient as a real chip plus an inline editor with autocomplete.
///
/// Why this widget rather than a plain TextField:
/// 1. Chips communicate "this address is locked in" — backspace
///    removes the last chip; tap-X removes any chip.
/// 2. Comma, semicolon, space, enter, and tab all commit the buffer.
///    Tapping outside the field also commits (so users don't lose
///    half-typed addresses on send).
/// 3. The row uses Wrap, so adding chips grows the row vertically
///    instead of pushing the input off-screen.
/// 4. As the user types, suggestions from /contacts/search appear in
///    an OverlayEntry that follows the field; tap or arrow+enter to
///    commit a suggestion.
class RecipientChipsField extends ConsumerStatefulWidget {
  const RecipientChipsField({
    super.key,
    required this.values,
    required this.onChanged,
    this.placeholder = 'name@domain.com',
    this.focusNode,
  });

  final List<String> values;
  final ValueChanged<List<String>> onChanged;
  final String placeholder;
  final FocusNode? focusNode;

  @override
  ConsumerState<RecipientChipsField> createState() =>
      _RecipientChipsFieldState();
}

class _RecipientChipsFieldState extends ConsumerState<RecipientChipsField> {
  late final TextEditingController _controller;
  late final FocusNode _focusNode;
  final LayerLink _layerLink = LayerLink();
  final GlobalKey _fieldKey = GlobalKey();
  OverlayEntry? _overlay;
  Timer? _debounce;
  List<ContactSuggestion> _suggestions = const [];
  int _highlighted = 0;
  ContactsSearch? _search;
  int _searchToken = 0;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController();
    _focusNode = widget.focusNode ?? FocusNode();
    _focusNode.addListener(_handleFocusChange);
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _removeOverlay();
    _controller.dispose();
    if (widget.focusNode == null) {
      _focusNode.dispose();
    } else {
      _focusNode.removeListener(_handleFocusChange);
    }
    super.dispose();
  }

  Future<void> _ensureSearch() async {
    if (_search != null) return;
    final client = await ref.read(apiClientProvider.future);
    _search = ContactsSearch(client);
  }

  void _handleFocusChange() {
    if (!_focusNode.hasFocus) {
      // If a suggestion overlay is open, defer briefly so a tap on a
      // suggestion can land before the field commits the raw buffer.
      // When there's no overlay (offline / no autocomplete results),
      // commit immediately — important for tests + the "type-then-
      // hit-Send-without-comma" flow.
      if (_overlay == null) {
        final pending = _controller.text.trim();
        if (pending.isNotEmpty) _commit(pending);
        return;
      }
      Future.delayed(const Duration(milliseconds: 120), () {
        if (!mounted || _focusNode.hasFocus) return;
        final pending = _controller.text.trim();
        if (pending.isNotEmpty) _commit(pending);
        _removeOverlay();
      });
    } else {
      _scheduleQuery(_controller.text);
    }
  }

  void _scheduleQuery(String query) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 200), () async {
      if (!mounted) return;
      final myToken = ++_searchToken;
      try {
        await _ensureSearch();
        final results = await _search!.search(query);
        // Stale-response guard.
        if (!mounted || myToken != _searchToken) return;
        setState(() {
          _suggestions = results;
          _highlighted = 0;
        });
        _refreshOverlay();
      } catch (_) {
        if (!mounted || myToken != _searchToken) return;
        setState(() => _suggestions = const []);
        _refreshOverlay();
      }
    });
  }

  void _commit(String raw) {
    final trimmed = raw.trim().replaceAll(RegExp(r'[,;]+$'), '').trim();
    if (trimmed.isEmpty) return;
    if (!trimmed.contains('@')) return;
    if (widget.values.contains(trimmed)) {
      _controller.clear();
      return;
    }
    widget.onChanged([...widget.values, trimmed]);
    _controller.clear();
    setState(() => _suggestions = const []);
    _refreshOverlay();
  }

  void _commitSuggestion(ContactSuggestion s) {
    if (widget.values.contains(s.email)) {
      _controller.clear();
      return;
    }
    widget.onChanged([...widget.values, s.email]);
    _controller.clear();
    setState(() => _suggestions = const []);
    _refreshOverlay();
  }

  void _remove(String value) {
    widget.onChanged(widget.values.where((v) => v != value).toList());
  }

  KeyEventResult _onKey(FocusNode node, KeyEvent event) {
    if (event is! KeyDownEvent) return KeyEventResult.ignored;
    final key = event.logicalKey;
    if (key == LogicalKeyboardKey.arrowDown && _suggestions.isNotEmpty) {
      setState(() => _highlighted =
          (_highlighted + 1).clamp(0, _suggestions.length - 1));
      _refreshOverlay();
      return KeyEventResult.handled;
    }
    if (key == LogicalKeyboardKey.arrowUp && _suggestions.isNotEmpty) {
      setState(() => _highlighted = (_highlighted - 1).clamp(0, _suggestions.length - 1));
      _refreshOverlay();
      return KeyEventResult.handled;
    }
    if (key == LogicalKeyboardKey.backspace &&
        _controller.text.isEmpty &&
        widget.values.isNotEmpty) {
      _remove(widget.values.last);
      return KeyEventResult.handled;
    }
    if (key == LogicalKeyboardKey.enter || key == LogicalKeyboardKey.tab) {
      if (_focusNode.hasFocus &&
          _suggestions.isNotEmpty &&
          _highlighted < _suggestions.length) {
        _commitSuggestion(_suggestions[_highlighted]);
        return KeyEventResult.handled;
      }
      final pending = _controller.text;
      if (pending.trim().isNotEmpty) {
        _commit(pending);
        return KeyEventResult.handled;
      }
    }
    return KeyEventResult.ignored;
  }

  // ── Overlay management ──────────────────────────────────────────

  void _showOverlay() {
    _removeOverlay();
    if (_suggestions.isEmpty) return;
    final overlay = Overlay.maybeOf(context);
    final ctx = _fieldKey.currentContext;
    if (overlay == null || ctx == null) return;
    final box = ctx.findRenderObject() as RenderBox?;
    if (box == null) return;
    final width = box.size.width;
    _overlay = OverlayEntry(
      builder: (context) => Positioned(
        width: width,
        child: CompositedTransformFollower(
          link: _layerLink,
          showWhenUnlinked: false,
          offset: const Offset(0, 6),
          child: Material(
            color: AppColors.surface,
            elevation: 6,
            child: _SuggestionList(
              suggestions: _suggestions,
              highlighted: _highlighted,
              onTap: _commitSuggestion,
            ),
          ),
        ),
      ),
    );
    overlay.insert(_overlay!);
  }

  void _refreshOverlay() {
    if (_suggestions.isEmpty || !_focusNode.hasFocus) {
      _removeOverlay();
      return;
    }
    if (_overlay == null) {
      _showOverlay();
    } else {
      _overlay!.markNeedsBuild();
    }
  }

  void _removeOverlay() {
    _overlay?.remove();
    _overlay = null;
  }

  // ── Build ───────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    return CompositedTransformTarget(
      link: _layerLink,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: _focusNode.requestFocus,
        child: Wrap(
          key: _fieldKey,
          spacing: 6,
          runSpacing: 6,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            for (final v in widget.values)
              _Chip(label: v, onRemove: () => _remove(v)),
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
                      hintText: widget.values.isEmpty ? widget.placeholder : null,
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
                      if (value.endsWith(',') || value.endsWith(';')) {
                        _commit(value);
                        return;
                      }
                      _scheduleQuery(value);
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
      ),
    );
  }
}

class _SuggestionList extends StatelessWidget {
  const _SuggestionList({
    required this.suggestions,
    required this.highlighted,
    required this.onTap,
  });

  final List<ContactSuggestion> suggestions;
  final int highlighted;
  final ValueChanged<ContactSuggestion> onTap;

  @override
  Widget build(BuildContext context) {
    return ConstrainedBox(
      constraints: const BoxConstraints(maxHeight: 280),
      child: ListView.separated(
        shrinkWrap: true,
        padding: EdgeInsets.zero,
        itemCount: suggestions.length,
        separatorBuilder: (_, _) =>
            const Divider(height: 1, color: AppColors.border),
        itemBuilder: (context, i) {
          final s = suggestions[i];
          final isHi = i == highlighted;
          return InkWell(
            onTap: () => onTap(s),
            child: Container(
              color: isHi ? AppColors.surfaceElevated : Colors.transparent,
              padding:
                  const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              child: Row(
                children: [
                  Container(
                    width: 28,
                    height: 28,
                    color: AppColors.accentDim,
                    alignment: Alignment.center,
                    child: const Icon(Icons.mail_outline,
                        size: 14, color: AppColors.accent),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          s.name?.isNotEmpty == true ? s.name! : s.email,
                          style: GoogleFonts.inter(
                            fontSize: 13,
                            fontWeight: FontWeight.w500,
                            color: AppColors.textPrimary,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        if (s.name?.isNotEmpty == true)
                          Text(
                            s.email,
                            style: GoogleFonts.jetBrainsMono(
                              fontSize: 10,
                              color: AppColors.textMuted,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                      ],
                    ),
                  ),
                  Text(
                    _sourceLabel(s.source),
                    style: GoogleFonts.jetBrainsMono(
                      fontSize: 9,
                      fontWeight: FontWeight.w700,
                      color: AppColors.textMuted,
                      letterSpacing: 0.5,
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  String _sourceLabel(String source) {
    switch (source) {
      case 'org_member':
        return 'TEAM';
      case 'recent':
        return 'RECENT';
      default:
        return 'CONTACT';
    }
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
