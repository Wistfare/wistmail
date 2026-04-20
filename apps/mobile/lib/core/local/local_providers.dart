import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../features/mail/data/mail_repository.dart';
import '../../features/mail/data/outbox_handlers.dart';
import '../../features/mail/presentation/providers/mail_providers.dart';
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

/// SyncEngine — singleton, drain loop owned. `keepAlive` prevents
/// disposal when no widget is watching, so the engine keeps draining
/// in the background.
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
  ref.onDispose(() {
    // Best-effort stop — ref disposal happens on app shutdown only,
    // since we keepAlive above.
    engine.stop();
  });
  return engine;
});
