import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:rxdart/rxdart.dart';

import '../network/api_exception.dart';
import 'email_local_store.dart';
import 'outbox.dart';

/// Hook for telemetry — tests can capture, production can pipe to
/// Datadog/Sentry. Default impl prints in debug mode and no-ops in
/// release. Each event is a flat key/value bag so downstream sinks
/// can flatten without parsing.
typedef SyncTelemetrySink = void Function(SyncTelemetryEvent event);

class SyncTelemetryEvent {
  const SyncTelemetryEvent(this.kind, [this.data = const {}]);

  /// 'enqueue' | 'dispatch_start' | 'dispatch_ok' | 'dispatch_retry' |
  /// 'dispatch_failed' | 'drain_tick'
  final String kind;
  final Map<String, Object?> data;
}

void _defaultTelemetry(SyncTelemetryEvent e) {
  if (!kReleaseMode) {
    debugPrint('[sync-engine] ${e.kind} ${e.data}');
  }
}

/// Surface state for the "X unsynced" pill / inspector.
class SyncStatus {
  const SyncStatus({
    required this.pending,
    required this.lastError,
    required this.busy,
    required this.offline,
  });

  /// Pending + inflight + failed combined — anything we still owe the
  /// server.
  final int pending;
  final String? lastError;
  final bool busy;
  final bool offline;

  bool get hasPending => pending > 0;

  static const idle = SyncStatus(
    pending: 0,
    lastError: null,
    busy: false,
    offline: false,
  );
}

/// Function signature each `OutboxOp` resolves to. The dispatcher
/// looks this up from the registered handler map; the impl lives in
/// the feature layer (e.g. mail_outbox_handlers.dart) so the engine
/// stays domain-agnostic.
typedef OutboxHandler = Future<void> Function(
  OutboxRow row,
  EmailLocalStore store,
);

/// SyncEngine
///
/// Owns the outbox drain loop. Three responsibilities:
///   1. Coalesce + debounce: enqueue() goes through Outbox.enqueue
///      (which folds same-key writes); after every enqueue we wait
///      `_kDrainDebounce` for the user to stop tapping before we
///      actually fire HTTP. The combination of the two means five
///      star toggles in a second produce one network request.
///   2. Retry with exponential backoff. The schedule mirrors the
///      backend's send-dispatcher so server + client stay in sync.
///   3. Status surface for the UI — Stream<SyncStatus>.
class SyncEngine {
  SyncEngine({
    required Outbox outbox,
    required EmailLocalStore store,
    required Map<OutboxOp, OutboxHandler> handlers,
    Duration drainDebounce = const Duration(milliseconds: 250),
    Duration tickInterval = const Duration(seconds: 15),
    SyncTelemetrySink? telemetry,
  })  : _outbox = outbox,
        _store = store,
        _handlers = handlers,
        _drainDebounce = drainDebounce,
        _tickInterval = tickInterval,
        _telemetry = telemetry ?? _defaultTelemetry;

  /// Backoff schedule: 1s, 4s, 30s, 5m, 1h. Exhausts at index ==
  /// length, at which point the row goes to 'failed'.
  static const List<int> retryDelaysMs = [
    1000,
    4000,
    30_000,
    5 * 60_000,
    60 * 60_000,
  ];
  static const int maxAttempts = 5;

  final Outbox _outbox;
  final EmailLocalStore _store;
  final Map<OutboxOp, OutboxHandler> _handlers;
  final Duration _drainDebounce;
  final Duration _tickInterval;
  final SyncTelemetrySink _telemetry;

  Timer? _debounceTimer;
  Timer? _tickTimer;
  bool _draining = false;
  bool _started = false;

  final BehaviorSubject<SyncStatus> _status =
      BehaviorSubject<SyncStatus>.seeded(SyncStatus.idle);
  Stream<SyncStatus> get status => _status.stream;
  SyncStatus get current => _status.value;

  Future<int> enqueue({
    required String entityType,
    required String entityId,
    required OutboxOp op,
    Map<String, Object?> payload = const {},
  }) async {
    final id = await _outbox.enqueue(
      entityType: entityType,
      entityId: entityId,
      op: op,
      payload: payload,
    );
    _telemetry(SyncTelemetryEvent('enqueue', {
      'rowId': id,
      'op': op.wireName,
      'entityType': entityType,
      'entityId': entityId,
    }));
    _scheduleDrain();
    await _publishStatus();
    return id;
  }

  /// Boot the periodic tick (catches retries whose backoff has
  /// elapsed without any new enqueue happening). Idempotent — call
  /// once on app startup.
  void start() {
    if (_started) return;
    _started = true;
    _tickTimer = Timer.periodic(_tickInterval, (_) => _scheduleDrain());
    _scheduleDrain();
  }

  Future<void> stop() async {
    _started = false;
    _tickTimer?.cancel();
    _tickTimer = null;
    _debounceTimer?.cancel();
    _debounceTimer = null;
    await _status.close();
  }

  /// Force-drain immediately, bypassing the debounce. Test-only.
  Future<void> drainNow() async {
    _debounceTimer?.cancel();
    await _drainOnce();
  }

  /// Inspector — list every row currently in the outbox (any status).
  Future<List<OutboxRow>> listAll() => _outbox.all();

  /// Inspector — user-initiated retry of a failed mutation. Re-arms
  /// the debounce so the drain runs shortly after.
  Future<void> requeue(int id) async {
    await _outbox.requeue(id);
    await _publishStatus(clearError: true);
    _scheduleDrain();
  }

  /// Inspector — user-initiated discard of a failed mutation.
  Future<void> discard(int id) async {
    await _outbox.discard(id);
    await _publishStatus();
  }

  void _scheduleDrain() {
    _debounceTimer?.cancel();
    _debounceTimer = Timer(_drainDebounce, () {
      _drainOnce();
    });
  }

  Future<void> _drainOnce() async {
    if (_draining) return;
    _draining = true;
    try {
      await _publishStatus(busy: true);
      final due = await _outbox.pullDue(DateTime.now().millisecondsSinceEpoch);
      for (final row in due) {
        final claimed = await _outbox.claim(row.id);
        if (!claimed) continue;
        await _runRow(row);
      }
    } finally {
      _draining = false;
      await _publishStatus(busy: false);
    }
  }

  Future<void> _runRow(OutboxRow row) async {
    final handler = _handlers[row.op];
    if (handler == null) {
      await _outbox.markFailed(
        row.id,
        'No handler registered for ${row.op.wireName}',
      );
      _telemetry(SyncTelemetryEvent('dispatch_failed', {
        'rowId': row.id,
        'op': row.op.wireName,
        'reason': 'no_handler',
      }));
      return;
    }

    _telemetry(SyncTelemetryEvent('dispatch_start', {
      'rowId': row.id,
      'op': row.op.wireName,
      'attempt': row.attempts + 1,
    }));

    try {
      await handler(row, _store);
      await _outbox.ackSuccess(row.id);
      await _publishStatus(clearError: true);
      _telemetry(SyncTelemetryEvent('dispatch_ok', {
        'rowId': row.id,
        'op': row.op.wireName,
      }));
    } catch (err) {
      final message = err.toString();
      final shouldRetry = _isRetryable(err) && row.attempts + 1 < maxAttempts;
      if (shouldRetry) {
        final delay = retryDelaysMs[
            row.attempts.clamp(0, retryDelaysMs.length - 1)];
        await _outbox.markRetry(
          id: row.id,
          error: message,
          delayMs: delay,
        );
        await _publishStatus(error: message);
        _telemetry(SyncTelemetryEvent('dispatch_retry', {
          'rowId': row.id,
          'op': row.op.wireName,
          'delayMs': delay,
          'attempt': row.attempts + 1,
        }));
        // Re-arm the debounce so the retry actually fires when its
        // window elapses (the periodic tick is the safety net).
        _scheduleDrain();
      } else {
        await _outbox.markFailed(row.id, message);
        await _publishStatus(error: message);
        _telemetry(SyncTelemetryEvent('dispatch_failed', {
          'rowId': row.id,
          'op': row.op.wireName,
          'attempt': row.attempts + 1,
          'reason': 'exhausted_or_hard_failure',
        }));
      }
    }
  }

  bool _isRetryable(Object err) {
    if (err is ApiException) {
      // 4xx (except 429) are caller errors — don't retry. 5xx + 429
      // + network errors are retryable.
      final code = err.statusCode;
      if (code == null) return true;
      if (code == 429) return true;
      if (code >= 500) return true;
      return false;
    }
    // Generic Object — assume network / transient.
    return true;
  }

  Future<void> _publishStatus({
    bool? busy,
    String? error,
    bool clearError = false,
  }) async {
    final pending = await _outbox.pendingCount();
    final next = SyncStatus(
      pending: pending,
      lastError: clearError ? null : (error ?? _status.value.lastError),
      busy: busy ?? _status.value.busy,
      offline: _status.value.offline,
    );
    if (!_status.isClosed) _status.add(next);
  }
}
