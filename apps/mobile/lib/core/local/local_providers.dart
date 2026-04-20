import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../features/auth/presentation/providers/auth_controller.dart';
import '../../features/mail/data/outbox_handlers.dart';
import '../../features/mail/presentation/providers/mail_providers.dart';
import 'compose_drafts_store.dart';
import 'email_local_store.dart';
import 'local_db.dart';
import 'outbox.dart';
import 'sync_engine.dart';

/// Riverpod-graph for the offline-first stack. The order matters:
/// LocalDb opens once, every other provider derives from it. We keep
/// the SyncEngine as a singleton via `keepAlive: true` so the drain
/// loop survives screen disposals.

final localDbProvider = FutureProvider<LocalDb>((ref) async {
  return LocalDb.open();
});

final emailLocalStoreProvider = FutureProvider<EmailLocalStore>((ref) async {
  final db = await ref.watch(localDbProvider.future);
  return EmailLocalStore(db);
});

final outboxProvider = FutureProvider<Outbox>((ref) async {
  final db = await ref.watch(localDbProvider.future);
  return Outbox(db);
});

final composeDraftsStoreProvider =
    FutureProvider<ComposeDraftsStore>((ref) async {
  final db = await ref.watch(localDbProvider.future);
  return ComposeDraftsStore(db);
});

/// SyncEngine — singleton, drain loop owned. `keepAlive` prevents
/// disposal when no widget is watching, so the engine keeps draining
/// in the background. We also tear it down when the user logs out so
/// it doesn't keep firing requests with stale auth cookies and
/// flooding the API with 401s.
final syncEngineProvider = FutureProvider<SyncEngine>((ref) async {
  ref.keepAlive();
  final outbox = await ref.watch(outboxProvider.future);
  final store = await ref.watch(emailLocalStoreProvider.future);
  final repo = await ref.watch(mailRepositoryProvider.future);
  final engine = SyncEngine(
    outbox: outbox,
    store: store,
    handlers: buildMailHandlers(repo),
  );
  engine.start();

  // Auth-aware lifecycle: stop draining the moment the user logs out
  // so we don't fire any more API calls with stale cookies. The engine
  // restarts naturally on next sign-in because the provider gets
  // re-watched after auth state changes.
  ref.listen<AuthState>(authControllerProvider, (prev, next) {
    final wasAuthed = prev?.user != null;
    final isAuthed = next.user != null;
    if (wasAuthed && !isAuthed) {
      engine.stop();
    }
  });

  ref.onDispose(() {
    engine.stop();
  });
  return engine;
});
