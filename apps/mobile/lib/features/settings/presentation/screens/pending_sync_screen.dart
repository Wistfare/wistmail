import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../../core/local/local_providers.dart';
import '../../../../core/local/outbox.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../../core/widgets/wm_app_bar.dart';

/// Pending Sync inspector — surfaces every row the SyncEngine is
/// holding so the user (or a support engineer reading over their
/// shoulder) can see exactly what's queued, in-flight, or failed.
///
/// Failed rows offer Retry + Discard. Pending/inflight rows are
/// read-only — the engine owns them.
class PendingSyncScreen extends ConsumerStatefulWidget {
  const PendingSyncScreen({super.key});

  @override
  ConsumerState<PendingSyncScreen> createState() => _PendingSyncScreenState();
}

class _PendingSyncScreenState extends ConsumerState<PendingSyncScreen> {
  late Future<List<OutboxRow>> _rowsFuture;

  @override
  void initState() {
    super.initState();
    _rowsFuture = _loadRows();
  }

  Future<List<OutboxRow>> _loadRows() async {
    final engine = await ref.read(syncEngineProvider.future);
    return engine.listAll();
  }

  Future<void> _refresh() async {
    setState(() {
      _rowsFuture = _loadRows();
    });
    await _rowsFuture;
  }

  @override
  Widget build(BuildContext context) {
    final engine = ref.watch(syncEngineProvider);
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: const WmAppBar(title: 'Pending sync'),
      body: engine.when(
        data: (_) => _Body(
          rowsFuture: _rowsFuture,
          onRetry: _retry,
          onDiscard: _discard,
          onRefresh: _refresh,
        ),
        loading: () => const Center(
          child: CircularProgressIndicator(color: AppColors.accent),
        ),
        error: (err, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Text(
              'Sync engine unavailable: $err',
              style: AppTextStyles.bodySmall,
              textAlign: TextAlign.center,
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _retry(OutboxRow row) async {
    final engine = await ref.read(syncEngineProvider.future);
    await engine.requeue(row.id);
    await _refresh();
  }

  Future<void> _discard(OutboxRow row) async {
    final engine = await ref.read(syncEngineProvider.future);
    await engine.discard(row.id);
    await _refresh();
  }
}

class _Body extends StatelessWidget {
  const _Body({
    required this.rowsFuture,
    required this.onRetry,
    required this.onDiscard,
    required this.onRefresh,
  });

  final Future<List<OutboxRow>> rowsFuture;
  final Future<void> Function(OutboxRow) onRetry;
  final Future<void> Function(OutboxRow) onDiscard;
  final Future<void> Function() onRefresh;

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<OutboxRow>>(
      future: rowsFuture,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Center(
            child: CircularProgressIndicator(color: AppColors.accent),
          );
        }
        if (snapshot.hasError) {
          return Center(
            child: Text(
              'Could not load outbox: ${snapshot.error}',
              style: AppTextStyles.bodySmall,
            ),
          );
        }
        final rows = snapshot.data ?? const [];
        if (rows.isEmpty) {
          return _AllSettled(onRefresh: onRefresh);
        }
        return RefreshIndicator(
          color: AppColors.accent,
          backgroundColor: AppColors.surface,
          onRefresh: onRefresh,
          child: ListView.separated(
            padding: const EdgeInsets.symmetric(vertical: 8),
            itemCount: rows.length,
            separatorBuilder: (_, _) =>
                const Divider(height: 1, color: AppColors.border),
            itemBuilder: (context, i) => _OutboxTile(
              row: rows[i],
              onRetry: onRetry,
              onDiscard: onDiscard,
            ),
          ),
        );
      },
    );
  }
}

class _AllSettled extends StatelessWidget {
  const _AllSettled({required this.onRefresh});
  final Future<void> Function() onRefresh;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.check_circle_outline,
                size: 40, color: AppColors.accent),
            const SizedBox(height: 16),
            Text("You're all caught up", style: AppTextStyles.titleMedium),
            const SizedBox(height: 6),
            Text(
              'Every change has been saved to the server.',
              style: AppTextStyles.bodySmall,
            ),
            const SizedBox(height: 16),
            TextButton(
              onPressed: onRefresh,
              child: Text(
                'Refresh',
                style: GoogleFonts.inter(
                  color: AppColors.accent,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _OutboxTile extends StatelessWidget {
  const _OutboxTile({
    required this.row,
    required this.onRetry,
    required this.onDiscard,
  });

  final OutboxRow row;
  final Future<void> Function(OutboxRow) onRetry;
  final Future<void> Function(OutboxRow) onDiscard;

  @override
  Widget build(BuildContext context) {
    final isFailed = row.status == 'failed';
    final isInflight = row.status == 'inflight';
    final color = isFailed
        ? AppColors.danger
        : (isInflight ? AppColors.accent : AppColors.tagDigest);
    final created = DateTime.fromMillisecondsSinceEpoch(row.createdAtMs);
    final age = DateTime.now().difference(created);
    return ListTile(
      contentPadding:
          const EdgeInsets.symmetric(horizontal: 20, vertical: 4),
      leading: Container(
        width: 36,
        height: 36,
        alignment: Alignment.center,
        decoration: BoxDecoration(color: color.withValues(alpha: 0.15)),
        child: Icon(_iconFor(row), color: color, size: 18),
      ),
      title: Text(_titleFor(row), style: AppTextStyles.bodyMedium),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SizedBox(height: 2),
          Text(
            '${row.status.toUpperCase()} · attempts ${row.attempts} · ${_ago(age)}',
            style: GoogleFonts.jetBrainsMono(
              fontSize: 10,
              fontWeight: FontWeight.w600,
              color: color,
            ),
          ),
          if (row.lastError != null) ...[
            const SizedBox(height: 2),
            Text(
              row.lastError!,
              style: AppTextStyles.meta,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ],
      ),
      trailing: isFailed
          ? Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                IconButton(
                  icon: const Icon(Icons.refresh,
                      color: AppColors.accent, size: 20),
                  tooltip: 'Retry',
                  onPressed: () => onRetry(row),
                ),
                IconButton(
                  icon: const Icon(Icons.close,
                      color: AppColors.textTertiary, size: 20),
                  tooltip: 'Discard',
                  onPressed: () => _confirmDiscard(context, row),
                ),
              ],
            )
          : null,
    );
  }

  Future<void> _confirmDiscard(BuildContext context, OutboxRow row) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: AppColors.surface,
        title: Text('Discard change?', style: AppTextStyles.titleMedium),
        content: Text(
          'This change won\'t be sent to the server. The local edit you made will be reverted on the next refresh.',
          style: AppTextStyles.bodySmall,
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            style: TextButton.styleFrom(foregroundColor: AppColors.danger),
            child: const Text('Discard'),
          ),
        ],
      ),
    );
    if (confirmed == true) await onDiscard(row);
  }

  IconData _iconFor(OutboxRow row) {
    switch (row.op) {
      case OutboxOp.setStarred:
        return Icons.star_outline;
      case OutboxOp.setRead:
        return Icons.mark_email_read_outlined;
      case OutboxOp.archive:
        return Icons.archive_outlined;
      case OutboxOp.delete:
        return Icons.delete_outline;
      case OutboxOp.moveFolder:
        return Icons.folder_open;
      case OutboxOp.dispatchSend:
      case OutboxOp.composeSend:
        return Icons.send_outlined;
    }
  }

  String _titleFor(OutboxRow row) {
    switch (row.op) {
      case OutboxOp.setStarred:
        return 'Star toggle on email ${row.entityId}';
      case OutboxOp.setRead:
        return 'Read flag on email ${row.entityId}';
      case OutboxOp.archive:
        return 'Archive email ${row.entityId}';
      case OutboxOp.delete:
        return 'Delete email ${row.entityId}';
      case OutboxOp.moveFolder:
        return 'Move email ${row.entityId}';
      case OutboxOp.dispatchSend:
        return 'Send email ${row.entityId}';
      case OutboxOp.composeSend:
        return 'Compose new email';
    }
  }

  String _ago(Duration d) {
    if (d.inMinutes < 1) return 'just now';
    if (d.inMinutes < 60) return '${d.inMinutes}m ago';
    if (d.inHours < 24) return '${d.inHours}h ago';
    return '${d.inDays}d ago';
  }
}
