import 'package:flutter/material.dart';
import '../../../../core/theme/app_colors.dart';

/// Placeholder rows shown while the inbox is loading. Mirrors
/// [EmailListItem]'s structure so the layout doesn't shift when data arrives:
/// same 20/16 padding, same 18px left indent for content, same 1px hairline
/// dividers between rows. The bars pulse subtly between two surface tones.
class EmailListSkeleton extends StatelessWidget {
  const EmailListSkeleton({super.key, this.itemCount = 8});

  final int itemCount;

  @override
  Widget build(BuildContext context) {
    return ListView.separated(
      padding: EdgeInsets.zero,
      physics: const NeverScrollableScrollPhysics(),
      itemCount: itemCount,
      separatorBuilder: (_, __) =>
          const Divider(height: 1, color: AppColors.border),
      itemBuilder: (_, i) => _SkeletonRow(seed: i),
    );
  }
}

class _SkeletonRow extends StatelessWidget {
  const _SkeletonRow({required this.seed});
  final int seed;

  @override
  Widget build(BuildContext context) {
    // Slightly vary widths per row so it doesn't look mechanical.
    final senderWidth = 90 + (seed * 17) % 60;
    final subjectWidth = 200 + (seed * 23) % 60;
    final previewWidth = 240 + (seed * 11) % 60;

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const SizedBox(width: 18),
              _Bar(width: senderWidth.toDouble(), height: 12),
              const Spacer(),
              const _Bar(width: 32, height: 10),
            ],
          ),
          const SizedBox(height: 8),
          Padding(
            padding: const EdgeInsets.only(left: 18),
            child: _Bar(width: subjectWidth.toDouble(), height: 11),
          ),
          const SizedBox(height: 6),
          Padding(
            padding: const EdgeInsets.only(left: 18),
            child: _Bar(width: previewWidth.toDouble(), height: 10),
          ),
        ],
      ),
    );
  }
}

/// Pulsing surface block used as a placeholder. Implementation is a single
/// long-running tween so all blocks animate in sync (cheap, no shimmer math).
class _Bar extends StatefulWidget {
  const _Bar({required this.width, required this.height});
  final double width;
  final double height;

  @override
  State<_Bar> createState() => _BarState();
}

class _BarState extends State<_Bar> with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  late final Animation<Color?> _color;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1100),
    )..repeat(reverse: true);
    _color = ColorTween(
      begin: AppColors.surface,
      end: AppColors.surfaceElevated,
    ).animate(_controller);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _color,
      builder: (_, __) => Container(
        width: widget.width,
        height: widget.height,
        color: _color.value,
      ),
    );
  }
}
