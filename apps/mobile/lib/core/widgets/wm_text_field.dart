import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../theme/app_colors.dart';
import '../theme/app_text_styles.dart';

/// Text field with mono uppercase label above it.
/// Matches Mobile/SignIn email/password and Mobile/ForgotPassword inputs.
/// Subtle 12px radius keeps it in the same family as the V3 inbox/today
/// cards without going soft.
class WmTextField extends StatefulWidget {
  const WmTextField({
    super.key,
    required this.label,
    this.hint,
    this.prefixIcon,
    this.isPassword = false,
    this.controller,
    this.keyboardType,
    this.textCapitalization = TextCapitalization.none,
    this.autofillHints,
    this.autofocus = false,
    this.onChanged,
    this.onSubmitted,
    this.trailing,
  });

  final String label;
  final String? hint;
  final IconData? prefixIcon;
  final bool isPassword;
  final TextEditingController? controller;
  final TextInputType? keyboardType;
  final TextCapitalization textCapitalization;
  final List<String>? autofillHints;
  final bool autofocus;
  final ValueChanged<String>? onChanged;
  final ValueChanged<String>? onSubmitted;

  /// Optional widget shown on the right side of the label row — e.g. a
  /// "Forgot Password?" link beside the password field. Doesn't change the
  /// vertical distance between fields.
  final Widget? trailing;

  @override
  State<WmTextField> createState() => _WmTextFieldState();
}

class _WmTextFieldState extends State<WmTextField> {
  bool _obscure = true;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            Text(widget.label.toUpperCase(), style: AppTextStyles.inputLabel),
            if (widget.trailing != null) ...[
              const Spacer(),
              widget.trailing!,
            ],
          ],
        ),
        const SizedBox(height: 10),
        Container(
          decoration: BoxDecoration(
            color: AppColors.surface,
            border: Border.all(color: AppColors.border, width: 1),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Row(
            children: [
              if (widget.prefixIcon != null)
                Padding(
                  padding: const EdgeInsets.only(left: 14, right: 8),
                  child: Icon(
                    widget.prefixIcon,
                    size: 16,
                    color: AppColors.textTertiary,
                  ),
                ),
              Expanded(
                child: TextField(
                  controller: widget.controller,
                  obscureText: widget.isPassword && _obscure,
                  keyboardType: widget.keyboardType,
                  textCapitalization: widget.textCapitalization,
                  autofillHints: widget.autofillHints,
                  autofocus: widget.autofocus,
                  onChanged: widget.onChanged,
                  onSubmitted: widget.onSubmitted,
                  cursorColor: AppColors.accent,
                  cursorWidth: 1.5,
                  style: GoogleFonts.jetBrainsMono(
                    fontSize: 13,
                    color: AppColors.textPrimary,
                  ),
                  decoration: InputDecoration(
                    hintText: widget.hint,
                    hintStyle: GoogleFonts.jetBrainsMono(
                      fontSize: 13,
                      color: AppColors.textTertiary,
                    ),
                    isCollapsed: true,
                    border: InputBorder.none,
                    enabledBorder: InputBorder.none,
                    focusedBorder: InputBorder.none,
                    contentPadding: EdgeInsets.fromLTRB(
                      widget.prefixIcon != null ? 0 : 14,
                      14,
                      14,
                      14,
                    ),
                  ),
                ),
              ),
              if (widget.isPassword)
                IconButton(
                  splashRadius: 20,
                  icon: Icon(
                    _obscure
                        ? Icons.visibility_off_outlined
                        : Icons.visibility_outlined,
                    size: 18,
                    color: AppColors.textTertiary,
                  ),
                  onPressed: () => setState(() => _obscure = !_obscure),
                ),
            ],
          ),
        ),
      ],
    );
  }
}
