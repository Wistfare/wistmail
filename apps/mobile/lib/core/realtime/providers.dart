import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../network/providers.dart';
import 'realtime_client.dart';
import 'realtime_event.dart';

final realtimeClientProvider = FutureProvider<RealtimeClient>((ref) async {
  final config = ref.watch(appConfigProvider);
  final jar = await ref.watch(cookieJarProvider.future);
  final client = RealtimeClient(baseUrl: config.apiBaseUrl, cookieJar: jar);
  ref.onDispose(() {
    client.dispose();
  });
  return client;
});

/// Broadcast stream of realtime events. Null until the client is ready.
final realtimeEventStreamProvider = StreamProvider<RealtimeEvent>((ref) async* {
  final client = await ref.watch(realtimeClientProvider.future);
  await client.connect();
  yield* client.events;
});
