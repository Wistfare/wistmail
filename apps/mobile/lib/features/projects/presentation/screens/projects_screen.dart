import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../../core/widgets/wm_bottom_nav.dart';
import '../../../../core/widgets/wm_tag.dart';
import '../../domain/project.dart';
import '../providers/projects_providers.dart';

/// Mobile/Projects — design.lib.pen node `JKS0t`. Sharp project cards
/// with status pill, lime progress bar, member icons + due date row.
class ProjectsScreen extends ConsumerStatefulWidget {
  const ProjectsScreen({super.key});

  @override
  ConsumerState<ProjectsScreen> createState() => _ProjectsScreenState();
}

class _ProjectsScreenState extends ConsumerState<ProjectsScreen> {
  String? _status;

  @override
  Widget build(BuildContext context) {
    final projects = ref.watch(projectsListProvider(_status));

    return Scaffold(
      backgroundColor: AppColors.background,
      body: Column(
        children: [
          _TopBar(
            onSearch: () {},
            onAdd: () => context.push('/projects/new'),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
            child: Row(
              children: [
                _StatusChip(
                  label: 'All',
                  selected: _status == null,
                  onTap: () => setState(() => _status = null),
                ),
                const SizedBox(width: 8),
                _StatusChip(
                  label: 'Active',
                  selected: _status == 'active',
                  onTap: () => setState(() => _status = 'active'),
                ),
                const SizedBox(width: 8),
                _StatusChip(
                  label: 'Completed',
                  selected: _status == 'completed',
                  onTap: () => setState(() => _status = 'completed'),
                ),
              ],
            ),
          ),
          Expanded(
            child: projects.when(
              data: (list) {
                if (list.isEmpty) {
                  return Center(
                    child: Padding(
                      padding: const EdgeInsets.all(32),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(Icons.folder_outlined,
                              size: 40, color: AppColors.textTertiary),
                          const SizedBox(height: 14),
                          Text('No projects yet',
                              style: AppTextStyles.titleMedium),
                        ],
                      ),
                    ),
                  );
                }
                return RefreshIndicator(
                  color: AppColors.accent,
                  backgroundColor: AppColors.surface,
                  onRefresh: () async {
                    ref.invalidate(projectsListProvider(_status));
                    await ref.read(projectsListProvider(_status).future);
                  },
                  child: ListView.builder(
                    padding: const EdgeInsets.symmetric(horizontal: 20),
                    physics: const AlwaysScrollableScrollPhysics(),
                    itemCount: list.length,
                    itemBuilder: (context, index) =>
                        _ProjectCard(project: list[index]),
                  ),
                );
              },
              loading: () => const Center(
                child: SizedBox(
                  width: 22,
                  height: 22,
                  child: CircularProgressIndicator(
                      strokeWidth: 2, color: AppColors.accent),
                ),
              ),
              error: (err, _) => Center(
                child: Padding(
                  padding: const EdgeInsets.all(32),
                  child: Text(err.toString(), style: AppTextStyles.bodySmall),
                ),
              ),
            ),
          ),
        ],
      ),
      bottomNavigationBar: const WmBottomNav(currentIndex: 4),
    );
  }
}

class _TopBar extends StatelessWidget {
  const _TopBar({required this.onSearch, required this.onAdd});
  final VoidCallback onSearch;
  final VoidCallback onAdd;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      bottom: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 8, 8, 16),
        child: Row(
          children: [
            Text('Projects', style: AppTextStyles.titleLarge),
            const Spacer(),
            IconButton(
              splashRadius: 22,
              icon: const Icon(Icons.search, size: 22),
              color: AppColors.textSecondary,
              onPressed: onSearch,
            ),
            IconButton(
              splashRadius: 22,
              icon: const Icon(Icons.add, size: 22),
              color: AppColors.accent,
              onPressed: onAdd,
            ),
          ],
        ),
      ),
    );
  }
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
        decoration: BoxDecoration(
          color: selected ? AppColors.accent : Colors.transparent,
          border: Border.all(
            color: selected ? AppColors.accent : AppColors.border,
            width: 1,
          ),
        ),
        child: Text(
          label,
          style: GoogleFonts.inter(
            fontSize: 12,
            fontWeight: FontWeight.w600,
            color: selected ? AppColors.background : AppColors.textPrimary,
          ),
        ),
      ),
    );
  }
}

class _ProjectCard extends StatelessWidget {
  const _ProjectCard({required this.project});
  final Project project;

  @override
  Widget build(BuildContext context) {
    final isCompleted = project.isCompleted;
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: const BoxDecoration(
        color: AppColors.surface,
        border: Border.fromBorderSide(
          BorderSide(color: AppColors.border, width: 1),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  project.name,
                  style: GoogleFonts.inter(
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                    color: AppColors.textPrimary,
                  ),
                ),
              ),
              if (isCompleted)
                const WmTag(label: 'Completed', color: AppColors.tagWork)
              else
                const WmAccentTag(label: 'Active'),
            ],
          ),
          if (project.description != null && project.description!.isNotEmpty) ...[
            const SizedBox(height: 6),
            Text(
              project.description!,
              style: AppTextStyles.bodySmall,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          ],
          const SizedBox(height: 12),
          _Progress(
              value: project.progress,
              color: isCompleted ? AppColors.tagWork : AppColors.accent),
          const SizedBox(height: 12),
          Row(
            children: [
              const Icon(Icons.people_outline,
                  size: 14, color: AppColors.textTertiary),
              const SizedBox(width: 4),
              Text(
                '${project.memberUserIds.length} members',
                style: AppTextStyles.monoSmall.copyWith(fontSize: 11),
              ),
              const Spacer(),
              if (project.dueDate != null)
                Row(
                  children: [
                    Icon(
                        isCompleted
                            ? Icons.check_circle_outline
                            : Icons.calendar_today_outlined,
                        size: 14,
                        color: AppColors.textTertiary),
                    const SizedBox(width: 4),
                    Text(
                      isCompleted ? 'Done' : _fmtDate(project.dueDate!),
                      style: AppTextStyles.monoSmall.copyWith(fontSize: 11),
                    ),
                  ],
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _Progress extends StatelessWidget {
  const _Progress({required this.value, required this.color});
  final int value;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Expanded(
          child: Stack(
            children: [
              Container(height: 4, color: AppColors.border),
              FractionallySizedBox(
                widthFactor: (value.clamp(0, 100)) / 100,
                child: Container(height: 4, color: color),
              ),
            ],
          ),
        ),
        const SizedBox(width: 10),
        Text(
          '$value%',
          style: GoogleFonts.jetBrainsMono(
            fontSize: 12,
            fontWeight: FontWeight.w600,
            color: color,
          ),
        ),
      ],
    );
  }
}

String _fmtDate(DateTime d) {
  const months = [
    '', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  return '${months[d.month]} ${d.day}';
}
