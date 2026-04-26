import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../theme/app_colors.dart';
import '../theme/app_text_styles.dart';

/// Text field with mono uppercase label above it.
/// Matches Mobile/SignIn email/password and Mobile/ForgotPassword inputs.
///
/// Border, radius and surface fill live on the TextField's own
/// InputDecoration (OutlineInputBorder + filled: true) — wrapping it in
/// an outer rounded Container caused the field's internal layers
/// (autofill highlight, IME hint backing) to bleed past the corners on
/// fields with no right-side widget to bound them. One surface, no
/// clip mismatch.
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
    final border = OutlineInputBorder(
      borderRadius: BorderRadius.circular(12),
      borderSide: const BorderSide(color: AppColors.border, width: 1),
    );
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
        TextField(
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
            filled: true,
            fillColor: AppColors.surface,
            prefixIcon: widget.prefixIcon == null
                ? null
                : Icon(
                    widget.prefixIcon,
                    size: 16,
                    color: AppColors.textTertiary,
                  ),
            prefixIconConstraints: const BoxConstraints(
              minWidth: 40,
              minHeight: 40,
            ),
            suffixIcon: widget.isPassword
                ? IconButton(
                    splashRadius: 20,
                    icon: Icon(
                      _obscure
                          ? Icons.visibility_off_outlined
                          : Icons.visibility_outlined,
                      size: 18,
                      color: AppColors.textTertiary,
                    ),
                    onPressed: () => setState(() => _obscure = !_obscure),
                  )
                : null,
            border: border,
            enabledBorder: border,
            focusedBorder: border,
            contentPadding: EdgeInsets.fromLTRB(
              widget.prefixIcon != null ? 0 : 14,
              14,
              14,
              14,
            ),
          ),
        ),
      ],
    );
  }
}
