import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../../../core/theme/app_colors.dart';

/// 6-digit code input matching design.lib.pen MfaChallenge `vBdQj`.
/// Six fixed-width boxes with subtle 8px radius. Active boxes (next to
/// type) are outlined in the brand accent; filled boxes show the digit
/// in JetBrains Mono. Auto-advances + supports paste of a full code.
class WmCodeInput extends StatefulWidget {
  const WmCodeInput({
    super.key,
    this.length = 6,
    required this.onChanged,
    this.onCompleted,
    this.autofocus = true,
  });

  final int length;
  final ValueChanged<String> onChanged;
  final ValueChanged<String>? onCompleted;
  final bool autofocus;

  @override
  State<WmCodeInput> createState() => _WmCodeInputState();
}

class _WmCodeInputState extends State<WmCodeInput> {
  late final List<TextEditingController> _ctrls;
  late final List<FocusNode> _focuses;

  @override
  void initState() {
    super.initState();
    _ctrls = List.generate(widget.length, (_) => TextEditingController());
    _focuses = List.generate(widget.length, (_) => FocusNode());
  }

  @override
  void dispose() {
    for (final c in _ctrls) {
      c.dispose();
    }
    for (final f in _focuses) {
      f.dispose();
    }
    super.dispose();
  }

  String get _value => _ctrls.map((c) => c.text).join();

  void _onCharChanged(int index, String v) {
    if (v.length > 1) {
      // Paste — distribute across boxes from this index onward.
      final digits = v.replaceAll(RegExp(r'[^0-9]'), '');
      for (int i = 0; i < widget.length; i++) {
        if (i < index) continue;
        final pos = i - index;
        _ctrls[i].text = pos < digits.length ? digits[pos] : '';
      }
      final lastFilled = (digits.length - 1 + index).clamp(0, widget.length - 1);
      _focuses[lastFilled].requestFocus();
    } else if (v.isNotEmpty && index < widget.length - 1) {
      _focuses[index + 1].requestFocus();
    }
    widget.onChanged(_value);
    if (_value.length == widget.length && !_value.contains('')) {
      widget.onCompleted?.call(_value);
    }
  }

  KeyEventResult _onKey(int index, FocusNode node, KeyEvent event) {
    if (event is KeyDownEvent &&
        event.logicalKey == LogicalKeyboardKey.backspace &&
        _ctrls[index].text.isEmpty &&
        index > 0) {
      _ctrls[index - 1].clear();
      _focuses[index - 1].requestFocus();
      widget.onChanged(_value);
      return KeyEventResult.handled;
    }
    return KeyEventResult.ignored;
  }

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: List.generate(widget.length, (i) {
        final filled = _ctrls[i].text.isNotEmpty;
        final hasFocus = _focuses[i].hasFocus;
        return Padding(
          padding: const EdgeInsets.symmetric(horizontal: 4),
          child: SizedBox(
            width: 48,
            height: 56,
            child: Focus(
              onKeyEvent: (node, event) => _onKey(i, node, event),
              child: Container(
                decoration: BoxDecoration(
                  color: AppColors.surface,
                  border: Border.all(
                    color: filled || hasFocus
                        ? AppColors.accent
                        : AppColors.border,
                    width: 1,
                  ),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: TextField(
                  controller: _ctrls[i],
                  focusNode: _focuses[i],
                  autofocus: widget.autofocus && i == 0,
                  textAlign: TextAlign.center,
                  keyboardType: TextInputType.number,
                  cursorColor: AppColors.accent,
                  cursorWidth: 2,
                  cursorHeight: 24,
                  inputFormatters: [
                    FilteringTextInputFormatter.digitsOnly,
                    // Allow up to length when pasting; otherwise single char
                    LengthLimitingTextInputFormatter(widget.length),
                  ],
                  style: GoogleFonts.jetBrainsMono(
                    fontSize: 22,
                    fontWeight: FontWeight.w600,
                    color: AppColors.textPrimary,
                    height: 1.1,
                  ),
                  decoration: const InputDecoration(
                    counterText: '',
                    // All four border slots must be InputBorder.none —
                    // setting only `border` lets the app's
                    // inputDecorationTheme's enabledBorder /
                    // focusedBorder leak through as a horizontal line
                    // bisecting each code box.
                    border: InputBorder.none,
                    enabledBorder: InputBorder.none,
                    focusedBorder: InputBorder.none,
                    disabledBorder: InputBorder.none,
                    isCollapsed: true,
                    contentPadding: EdgeInsets.zero,
                  ),
                  onChanged: (v) => _onCharChanged(i, v),
                ),
              ),
            ),
          ),
        );
      }),
    );
  }
}
