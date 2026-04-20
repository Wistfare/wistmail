import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../../core/local/local_providers.dart';
import '../../../../core/local/sync_engine.dart';
import '../../../../core/theme/app_colors.dart';

/// Tiny pill rendered next to the inbox title when the SyncEngine has
/// any pending or failed mutations. Tapping the pill opens the
/// "Pending sync" inspector in settings. Hidden when everything is
/// caught up so it never clutters the chrome during the common case.
class SyncStatusPill extends ConsumerWidget {
  const SyncStatusPill({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final engine = ref.watch(syncEngineProvider);
    return engine.when(
      data: (engineInst) => _Live(engine: engineInst),
      // While the engine is resolving (first frame on cold start) and
      // when it errors we render nothing — the inbox shouldn't gain a
      // pill from infrastructure failures.
      loading: () => const SizedBox.shrink(),
      error: (_, __) => const SizedBox.shrink(),
    );
  }
}

class _Live extends StatelessWidget {
  const _Live({required this.engine});
  final SyncEngine engine;

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<SyncStatus>(
      stream: engine.status,
      initialData: engine.current,
      builder: (context, snapshot) {
        final status = snapshot.data ?? SyncStatus.idle;
        if (!status.hasPending && status.lastError == null) {
          return const SizedBox.shrink();
        }
        final hasError = status.lastError != null;
        final color = hasError ? AppColors.danger : AppColors.accent;
        final icon = hasError
            ? Icons.error_outline
            : (status.busy ? Icons.sync : Icons.cloud_upload_outlined);
        final label = hasError
            ? '${status.pending} unsynced'
            : (status.busy ? 'Syncing…' : '${status.pending} pending');
        return Material(
          color: Colors.transparent,
          child: InkWell(
            onTap: () => context.push('/settings/pending-sync'),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.15),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(icon, size: 11, color: color),
                  const SizedBox(width: 4),
                  Text(
                    label,
                    style: GoogleFonts.jetBrainsMono(
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                      color: color,
                      height: 1.1,
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}
