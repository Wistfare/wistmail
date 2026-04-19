import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../../core/widgets/wm_app_bar.dart';
import '../providers/labels_providers.dart';

/// Mobile/LabelAssign — design.lib.pen node `W1H6e`. Sharp checkbox is a
/// 20x20 lime square with black tick when selected.
class LabelAssignScreen extends ConsumerStatefulWidget {
  const LabelAssignScreen({super.key, required this.emailId});

  final String emailId;

  @override
  ConsumerState<LabelAssignScreen> createState() => _LabelAssignScreenState();
}

class _LabelAssignScreenState extends ConsumerState<LabelAssignScreen> {
  Set<String>? _selected;
  bool _saving = false;

  @override
  Widget build(BuildContext context) {
    final labelsAsync = ref.watch(labelsListProvider);
    final currentAsync = ref.watch(labelsForEmailProvider(widget.emailId));

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: WmAppBar(
        title: 'Assign Label',
        actions: [
          IconButton(
            splashRadius: 22,
            icon: _saving
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(
                        strokeWidth: 2, color: AppColors.accent),
                  )
                : const Icon(Icons.check, color: AppColors.accent),
            onPressed: _saving ? null : _save,
          ),
        ],
      ),
      body: labelsAsync.when(
        data: (labels) => currentAsync.when(
          data: (current) {
            _selected ??= current.map((l) => l.id).toSet();
            if (labels.isEmpty) {
              return Center(
                child: Padding(
                  padding: const EdgeInsets.all(32),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text('No labels yet', style: AppTextStyles.titleMedium),
                      const SizedBox(height: 12),
                      Text('Create a label to start organizing.',
                          style: AppTextStyles.bodySmall),
                    ],
                  ),
                ),
              );
            }
            return ListView.separated(
              itemCount: labels.length + 1,
              separatorBuilder: (_, __) =>
                  const Divider(height: 1, color: AppColors.border),
              itemBuilder: (context, index) {
                if (index == labels.length) return const _CreateLabelTile();
                final label = labels[index];
                final isSelected = _selected!.contains(label.id);
                return Material(
                  color: Colors.transparent,
                  child: InkWell(
                    onTap: () {
                      setState(() {
                        if (isSelected) {
                          _selected!.remove(label.id);
                        } else {
                          _selected!.add(label.id);
                        }
                      });
                    },
                    child: Padding(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 20, vertical: 16),
                      child: Row(
                        children: [
                          Container(width: 14, height: 14, color: label.swatch),
                          const SizedBox(width: 14),
                          Expanded(
                            child: Text(
                              label.name,
                              style: GoogleFonts.inter(
                                fontSize: 14,
                                color: AppColors.textPrimary,
                              ),
                            ),
                          ),
                          _Check(checked: isSelected),
                        ],
                      ),
                    ),
                  ),
                );
              },
            );
          },
          loading: () => const _Loading(),
          error: (err, _) => _ErrorView(message: err.toString()),
        ),
        loading: () => const _Loading(),
        error: (err, _) => _ErrorView(message: err.toString()),
      ),
    );
  }

  Future<void> _save() async {
    if (_selected == null) return;
    setState(() => _saving = true);
    try {
      final repo = await ref.read(labelsRepositoryProvider.future);
      await repo.setForEmail(widget.emailId, _selected!.toList());
      ref.invalidate(labelsForEmailProvider(widget.emailId));
      if (!mounted) return;
      context.pop();
    } catch (_) {
      if (!mounted) return;
      setState(() => _saving = false);
    }
  }
}

class _Check extends StatelessWidget {
  const _Check({required this.checked});
  final bool checked;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 20,
      height: 20,
      decoration: BoxDecoration(
        color: checked ? AppColors.accent : Colors.transparent,
        border: Border.all(
          color: checked ? AppColors.accent : AppColors.borderStrong,
          width: 1,
        ),
      ),
      child: checked
          ? const Icon(Icons.check, size: 14, color: AppColors.background)
          : null,
    );
  }
}

class _CreateLabelTile extends StatelessWidget {
  const _CreateLabelTile();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
      child: Row(
        children: [
          const Icon(Icons.add, color: AppColors.accent, size: 18),
          const SizedBox(width: 14),
          Text(
            'Create New Label',
            style: GoogleFonts.inter(
              fontSize: 14,
              fontWeight: FontWeight.w600,
              color: AppColors.accent,
            ),
          ),
        ],
      ),
    );
  }
}

class _Loading extends StatelessWidget {
  const _Loading();
  @override
  Widget build(BuildContext context) => const Center(
        child: SizedBox(
          width: 22,
          height: 22,
          child: CircularProgressIndicator(
              strokeWidth: 2, color: AppColors.accent),
        ),
      );
}

class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.message});
  final String message;
  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Text(message,
              textAlign: TextAlign.center,
              style: AppTextStyles.bodySmall),
        ),
      );
}
