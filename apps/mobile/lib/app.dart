import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'core/theme/app_theme.dart';
import 'router/app_router.dart';

class WistMailApp extends StatelessWidget {
  const WistMailApp({super.key});

  @override
  Widget build(BuildContext context) {
    return const ProviderScope(child: _Root());
  }
}

class _Root extends StatelessWidget {
  const _Root();

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'Wistfare Mail',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.dark,
      routerConfig: appRouter,
    );
  }
}
