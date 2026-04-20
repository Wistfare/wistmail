import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'core/local/local_providers.dart';
import 'core/messaging/root_messenger.dart';
import 'core/theme/app_theme.dart';
import 'router/app_router.dart';

class WistMailApp extends StatelessWidget {
  const WistMailApp({super.key});

  @override
  Widget build(BuildContext context) {
    return const ProviderScope(child: _Root());
  }
}

class _Root extends ConsumerWidget {
  const _Root();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(appRouterProvider);
    // Eagerly bootstrap the offline-first stack so the sqflite open
    // happens during the first frame and the SyncEngine drain loop
    // is running by the time the inbox renders. The provider is
    // keepAlive so it survives screen disposals.
    ref.watch(syncEngineProvider);
    return MaterialApp.router(
      title: 'Wistfare Mail',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.dark,
      routerConfig: router,
      // Global SnackBar host — used by screens that pop themselves
      // right after triggering a reversible action (archive,
      // delete, etc.) so the undo affordance survives the pop.
      scaffoldMessengerKey: rootScaffoldMessengerKey,
    );
  }
}
