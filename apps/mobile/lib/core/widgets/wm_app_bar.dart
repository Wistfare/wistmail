import 'package:flutter/material.dart';
import '../theme/app_colors.dart';
import '../theme/app_text_styles.dart';

/// Top bar matching the design's `topBar` pattern: back arrow on the left,
/// optional title (Inter 16/600), action icons on the right. Sits flush
/// against the status bar with a 1px hairline at the bottom (optional).
class WmAppBar extends StatelessWidget implements PreferredSizeWidget {
  const WmAppBar({
    super.key,
    this.title,
    this.titleWidget,
    this.leading,
    this.actions = const [],
    this.showBack = true,
    this.onBack,
    this.divider = true,
  });

  /// Plain text title.
  final String? title;
  /// Custom title widget — overrides [title] when provided.
  final Widget? titleWidget;
  final Widget? leading;
  final List<Widget> actions;
  final bool showBack;
  final VoidCallback? onBack;
  final bool divider;

  @override
  Size get preferredSize => const Size.fromHeight(56);

  @override
  Widget build(BuildContext context) {
    final Widget? leadingWidget = leading ??
        (showBack
            ? IconButton(
                splashRadius: 22,
                icon: const Icon(Icons.arrow_back, size: 22),
                color: AppColors.textSecondary,
                onPressed: onBack ?? () => Navigator.of(context).maybePop(),
              )
            : null);

    return DecoratedBox(
      decoration: BoxDecoration(
        color: AppColors.background,
        border: divider
            ? const Border(bottom: BorderSide(color: AppColors.border, width: 1))
            : null,
      ),
      child: SizedBox(
        height: 56,
        child: Row(
          children: [
            if (leadingWidget != null)
              SizedBox(width: 56, child: Center(child: leadingWidget))
            else
              const SizedBox(width: 20),
            Expanded(
              child: titleWidget ??
                  (title != null
                      ? Text(title!, style: AppTextStyles.titleMedium)
                      : const SizedBox.shrink()),
            ),
            ...actions,
            const SizedBox(width: 8),
          ],
        ),
      ),
    );
  }
}

/// Section label used above grouped lists, e.g. "FOLDERS", "LABELS".
class WmSectionLabel extends StatelessWidget {
  const WmSectionLabel(this.label, {super.key, this.padding = EdgeInsets.zero});
  final String label;
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: padding,
      child: Text(label.toUpperCase(), style: AppTextStyles.sectionLabel),
    );
  }
}
