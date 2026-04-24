import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../../../core/theme/app_colors.dart';
import '../../domain/project.dart';
import '../providers/projects_providers.dart';

/// MobileV3 Work — pen node `MjaLH`.
///
/// Header (wHdr padding [8,16,12,16], gap 4):
///   Row space_between: left col gap 2 (eyebrow "PROJECTS · SPACES"
///   10/700 secondary letterSpacing 1.5, title "Work" 28/700 primary).
///   Actions gap 10: new 38×38 accent cornerRadius 19 plus 20 black,
///   search 38×38 surface cornerRadius 19 search 18 primary.
///
/// Body (wBody padding [0,16], gap 14):
///   "ACTIVE PROJECTS · N" 10/700 secondary letterSpacing 1.5.
///   Project card: cornerRadius 14 wm-surface, padding 14, gap 10 vertical.
///     p1h row space_between:
///       p1hl: icon badge 32×32 cornerRadius 8 (color varies), gap 10 to
///         title col (gap 2): name 14/700 primary + "N tasks · M people"
///         11/normal secondary.
///       p1badge (optional): cornerRadius 10, padding [4,8], fill
///         wm-accent-dim, text "@YOU" count 9/700 accent letterSpacing 1.
///     Progress bar: height 6, cornerRadius 3, track #1F1F1F, fill per
///       project color. Proportional width.
///     p1foot row space_between:
///       avatar stack (negative gap -8, 22×22 cornerRadius 11, 2px wm-surface
///         stroke, initials 9/700).
///       "60% · due Fri" 11/normal secondary.
///
/// "RECENT DOCS" 10/700 secondary letterSpacing 1.5.
/// Doc row: cornerRadius 12 wm-surface, padding [10,14], gap 12.
///   icon badge 32×32 cornerRadius 6 (color varies: accent/blue). title
///   13/700 primary. subtitle 11/normal secondary. chevron-right 16.
class WorkScreenV3 extends ConsumerWidget {
  const WorkScreenV3({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final projects = ref.watch(projectsListProvider('active'));
    final docs = ref.watch(recentDocsProvider);

    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _Header(onNew: () => context.push('/projects/new')),
            Expanded(
              child: RefreshIndicator(
                color: AppColors.accent,
                backgroundColor: AppColors.surface,
                onRefresh: () async {
                  ref.invalidate(projectsListProvider('active'));
                  ref.invalidate(recentDocsProvider);
                  await ref.read(projectsListProvider('active').future);
                },
                child: ListView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 20),
                  children: [
                    projects.when(
                      data: (list) => _ActiveProjects(projects: list),
                      loading: () => const _ProjectsSkeleton(),
                      error: (_, __) => const _ErrorBlock(),
                    ),
                    const SizedBox(height: 14),
                    _Eyebrow('RECENT DOCS'),
                    const SizedBox(height: 10),
                    docs.when(
                      data: (list) => list.isEmpty
                          ? const _DocsEmpty()
                          : Column(
                              children: [
                                for (int i = 0; i < list.length; i++) ...[
                                  _DocRow(doc: list[i]),
                                  if (i < list.length - 1)
                                    const SizedBox(height: 10),
                                ],
                              ],
                            ),
                      loading: () => const SizedBox(
                        height: 64,
                        child: Center(
                          child: CircularProgressIndicator(
                              color: AppColors.accent, strokeWidth: 2),
                        ),
                      ),
                      error: (_, __) => const _DocsEmpty(),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.onNew});
  final VoidCallback onNew;
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'PROJECTS · SPACES',
                  style: GoogleFonts.jetBrainsMono(
                    color: AppColors.textSecondary,
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 1.5,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  'Work',
                  style: GoogleFonts.jetBrainsMono(
                    color: AppColors.textPrimary,
                    fontSize: 28,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ),
          _CircleButton(
            icon: LucideIcons.plus,
            size: 20,
            filled: true,
            onTap: onNew,
          ),
          const SizedBox(width: 10),
          _CircleButton(
            icon: LucideIcons.search,
            size: 18,
            filled: false,
            onTap: () => context.push('/search'),
          ),
        ],
      ),
    );
  }
}

class _CircleButton extends StatelessWidget {
  const _CircleButton({
    required this.icon,
    required this.size,
    required this.filled,
    required this.onTap,
  });
  final IconData icon;
  final double size;
  final bool filled;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      customBorder: const CircleBorder(),
      child: Container(
        width: 38,
        height: 38,
        decoration: BoxDecoration(
          color: filled ? AppColors.accent : AppColors.surface,
          shape: BoxShape.circle,
        ),
        alignment: Alignment.center,
        child: Icon(
          icon,
          size: size,
          color: filled ? AppColors.background : AppColors.textPrimary,
        ),
      ),
    );
  }
}

class _Eyebrow extends StatelessWidget {
  const _Eyebrow(this.label);
  final String label;
  @override
  Widget build(BuildContext context) {
    return Text(
      label,
      style: GoogleFonts.jetBrainsMono(
        color: AppColors.textSecondary,
        fontSize: 10,
        fontWeight: FontWeight.w700,
        letterSpacing: 1.5,
      ),
    );
  }
}

class _ActiveProjects extends StatelessWidget {
  const _ActiveProjects({required this.projects});
  final List<Project> projects;
  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _Eyebrow('ACTIVE PROJECTS · ${projects.length}'),
        const SizedBox(height: 10),
        if (projects.isEmpty)
          const _EmptyProjects()
        else
          for (int i = 0; i < projects.length; i++) ...[
            _ProjectCard(project: projects[i], index: i),
            if (i < projects.length - 1) const SizedBox(height: 10),
          ],
      ],
    );
  }
}

class _ProjectCard extends StatelessWidget {
  const _ProjectCard({required this.project, required this.index});
  final Project project;
  final int index;

  @override
  Widget build(BuildContext context) {
    final accentPalette = _palette[index % _palette.length];
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(child: _Head(project: project, accent: accentPalette)),
              // @YOU badge shown when the project has open tasks.
              if (project.taskTotal > 0)
                _MentionBadge(count: project.taskTotal - project.taskDone),
            ],
          ),
          const SizedBox(height: 10),
          _ProgressBar(progress: project.progress, color: accentPalette.bar),
          const SizedBox(height: 10),
          Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Expanded(child: _AvatarStack(seeds: project.memberUserIds)),
              Text(
                '${project.progress}%'
                '${project.dueDate != null ? ' · due ${_dueLabel(project.dueDate!)}' : ''}',
                style: GoogleFonts.jetBrainsMono(
                  color: AppColors.textSecondary,
                  fontSize: 11,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  static String _dueLabel(DateTime d) {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ];
    final delta = d.difference(DateTime.now()).inDays;
    if (delta <= 7) return days[d.weekday - 1];
    return '${months[d.month - 1]} ${d.day}';
  }

  static const _palette = [
    _ProjectPalette(icon: LucideIcons.rocket, badge: AppColors.accent, bar: AppColors.accent),
    _ProjectPalette(icon: LucideIcons.palette, badge: Color(0xFF6D4AD4), bar: Color(0xFF6D4AD4)),
    _ProjectPalette(icon: LucideIcons.folder, badge: Color(0xFF3B82F6), bar: Color(0xFF3B82F6)),
  ];
}

class _ProjectPalette {
  const _ProjectPalette({required this.icon, required this.badge, required this.bar});
  final IconData icon;
  final Color badge;
  final Color bar;
}

class _Head extends StatelessWidget {
  const _Head({required this.project, required this.accent});
  final Project project;
  final _ProjectPalette accent;
  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Container(
          width: 32,
          height: 32,
          decoration: BoxDecoration(
            color: accent.badge,
            borderRadius: BorderRadius.circular(8),
          ),
          alignment: Alignment.center,
          child: Icon(
            accent.icon,
            size: 16,
            color: accent.badge == AppColors.accent
                ? AppColors.background
                : Colors.white,
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                project.name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: GoogleFonts.jetBrainsMono(
                  color: AppColors.textPrimary,
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                '${project.taskTotal} tasks · ${project.memberUserIds.length} people',
                style: GoogleFonts.jetBrainsMono(
                  color: AppColors.textSecondary,
                  fontSize: 11,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _MentionBadge extends StatelessWidget {
  const _MentionBadge({required this.count});
  final int count;
  @override
  Widget build(BuildContext context) {
    // Design p1badge: cornerRadius 10, padding [4,8], fill wm-accent-dim,
    // text "N @YOU" 9/700 accent letterSpacing 1.
    if (count <= 0) return const SizedBox.shrink();
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: AppColors.accentDim,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Text(
        '$count @YOU',
        style: GoogleFonts.jetBrainsMono(
          color: AppColors.accent,
          fontSize: 9,
          fontWeight: FontWeight.w700,
          letterSpacing: 1,
        ),
      ),
    );
  }
}

class _ProgressBar extends StatelessWidget {
  const _ProgressBar({required this.progress, required this.color});
  final int progress;
  final Color color;
  @override
  Widget build(BuildContext context) {
    // Design: height 6, cornerRadius 3, track #1F1F1F, fill color.
    final ratio = (progress / 100.0).clamp(0.0, 1.0);
    return LayoutBuilder(
      builder: (context, constraints) {
        return Stack(
          children: [
            Container(
              height: 6,
              decoration: BoxDecoration(
                color: const Color(0xFF1F1F1F),
                borderRadius: BorderRadius.circular(3),
              ),
            ),
            Container(
              height: 6,
              width: constraints.maxWidth * ratio,
              decoration: BoxDecoration(
                color: color,
                borderRadius: BorderRadius.circular(3),
              ),
            ),
          ],
        );
      },
    );
  }
}

class _AvatarStack extends StatelessWidget {
  const _AvatarStack({required this.seeds});
  final List<String> seeds;

  static const _palette = [
    Color(0xFFD44A4A),
    Color(0xFF1B6FE0),
    Color(0xFF3DB874),
    Color(0xFFD4A24A),
    Color(0xFF6D4AD4),
  ];

  @override
  Widget build(BuildContext context) {
    // Design: 22×22 cornerRadius 11, 2px wm-surface stroke, gap -8.
    const max = 4;
    final visible = seeds.take(max).toList();
    final width = 22 + (visible.length - 1) * 14;
    return SizedBox(
      width: width.toDouble().clamp(22, double.infinity),
      height: 22,
      child: Stack(
        children: [
          for (int i = 0; i < visible.length; i++)
            Positioned(
              left: i * 14.0,
              child: Container(
                width: 22,
                height: 22,
                decoration: BoxDecoration(
                  color: _palette[(seeds[i].hashCode.abs()) % _palette.length],
                  shape: BoxShape.circle,
                  border: Border.all(color: AppColors.surface, width: 2),
                ),
                alignment: Alignment.center,
                child: Text(
                  _initialsFor(visible[i]),
                  style: GoogleFonts.jetBrainsMono(
                    color: Colors.white,
                    fontSize: 9,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  static String _initialsFor(String seed) {
    if (seed.isEmpty) return '?';
    final first = seed[0];
    return first.toUpperCase();
  }
}

class _DocRow extends StatelessWidget {
  const _DocRow({required this.doc});
  final RecentDoc doc;
  @override
  Widget build(BuildContext context) {
    // Design: wm-surface, cornerRadius 12, padding [10,14], gap 12.
    return InkWell(
      onTap: () {},
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            _DocIcon(icon: _iconFor(doc.icon)),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    doc.title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: GoogleFonts.jetBrainsMono(
                      color: AppColors.textPrimary,
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    _subtitle(),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: GoogleFonts.jetBrainsMono(
                      color: AppColors.textSecondary,
                      fontSize: 11,
                    ),
                  ),
                ],
              ),
            ),
            const Icon(LucideIcons.chevronRight,
                color: AppColors.textSecondary, size: 16),
          ],
        ),
      ),
    );
  }

  IconData _iconFor(String? icon) {
    if (icon == 'table' || icon == 'sheet') return LucideIcons.table;
    return LucideIcons.fileText;
  }

  String _subtitle() {
    final age = _relativeAge(doc.updatedAt);
    return doc.projectName != null && doc.projectName!.isNotEmpty
        ? 'Edited $age · ${doc.projectName}'
        : 'Edited $age';
  }

  static String _relativeAge(DateTime t) {
    final delta = DateTime.now().difference(t);
    if (delta.inMinutes < 60) return '${delta.inMinutes}m ago';
    if (delta.inHours < 24) return '${delta.inHours}h ago';
    if (delta.inDays == 1) return 'yesterday';
    return '${delta.inDays}d ago';
  }
}

class _DocIcon extends StatelessWidget {
  const _DocIcon({required this.icon});
  final IconData icon;
  @override
  Widget build(BuildContext context) {
    // Design doc1ic: 32×32 cornerRadius 6, fill varies (accent-dim or
    // #1B6FE033). Icon size 16.
    final isTable = icon == LucideIcons.table;
    return Container(
      width: 32,
      height: 32,
      decoration: BoxDecoration(
        color: isTable
            ? const Color(0xFF1B6FE0).withValues(alpha: 0.2)
            : AppColors.accentDim,
        borderRadius: BorderRadius.circular(6),
      ),
      alignment: Alignment.center,
      child: Icon(
        icon,
        size: 16,
        color: isTable ? const Color(0xFF6FAEFF) : AppColors.accent,
      ),
    );
  }
}

class _EmptyProjects extends StatelessWidget {
  const _EmptyProjects();
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(14),
      ),
      alignment: Alignment.center,
      child: Text(
        'No active projects',
        style: GoogleFonts.jetBrainsMono(
          color: AppColors.textSecondary,
          fontSize: 13,
        ),
      ),
    );
  }
}

class _DocsEmpty extends StatelessWidget {
  const _DocsEmpty();
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        'No recent docs yet.',
        style: GoogleFonts.jetBrainsMono(
          color: AppColors.textTertiary,
          fontSize: 11,
        ),
      ),
    );
  }
}

class _ProjectsSkeleton extends StatelessWidget {
  const _ProjectsSkeleton();
  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _Eyebrow('ACTIVE PROJECTS'),
        const SizedBox(height: 10),
        Container(
          height: 124,
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(14),
          ),
        ),
      ],
    );
  }
}

class _ErrorBlock extends StatelessWidget {
  const _ErrorBlock();
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Text(
        "Couldn't load projects",
        style: GoogleFonts.jetBrainsMono(
          color: AppColors.textTertiary,
          fontSize: 13,
        ),
      ),
    );
  }
}
