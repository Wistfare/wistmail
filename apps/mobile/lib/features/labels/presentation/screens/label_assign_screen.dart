import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../../../core/theme/app_colors.dart';
import '../providers/labels_providers.dart';

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
      appBar: AppBar(
        backgroundColor: AppColors.background,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: AppColors.textPrimary),
          onPressed: () => context.pop(),
        ),
        title: Text(
          'Assign Label',
          style: GoogleFonts.inter(
            fontSize: 18,
            fontWeight: FontWeight.w600,
            color: AppColors.textPrimary,
          ),
        ),
        actions: [
          IconButton(
            icon: _saving
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.accent),
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
                      Text(
                        'No labels yet',
                        style: GoogleFonts.inter(
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                          color: AppColors.textPrimary,
                        ),
                      ),
                      const SizedBox(height: 12),
                      Text(
                        'Create a label to start organizing.',
                        style: GoogleFonts.inter(
                          fontSize: 13,
                          color: AppColors.textSecondary,
                        ),
                      ),
                    ],
                  ),
                ),
              );
            }
            return ListView.separated(
              itemCount: labels.length + 1,
              separatorBuilder: (context, index) => const Divider(height: 1, color: AppColors.border),
              itemBuilder: (context, index) {
                if (index == labels.length) return _CreateLabelTile();
                final label = labels[index];
                final isSelected = _selected!.contains(label.id);
                return InkWell(
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
                    padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
                    child: Row(
                      children: [
                        Container(
                          width: 14,
                          height: 14,
                          decoration: BoxDecoration(
                            color: label.swatch,
                            borderRadius: BorderRadius.circular(2),
                          ),
                        ),
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
                        _Checkbox(checked: isSelected),
                      ],
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

class _Checkbox extends StatelessWidget {
  const _Checkbox({required this.checked});
  final bool checked;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 20,
      height: 20,
      decoration: BoxDecoration(
        color: checked ? AppColors.accent : Colors.transparent,
        border: Border.all(
          color: checked ? AppColors.accent : AppColors.textTertiary,
        ),
        borderRadius: BorderRadius.circular(4),
      ),
      child: checked
          ? const Icon(Icons.check, size: 14, color: AppColors.background)
          : null,
    );
  }
}

class _CreateLabelTile extends StatelessWidget {
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
          width: 24,
          height: 24,
          child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.accent),
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
          child: Text(
            message,
            textAlign: TextAlign.center,
            style: GoogleFonts.inter(color: AppColors.textSecondary, fontSize: 13),
          ),
        ),
      );
}
