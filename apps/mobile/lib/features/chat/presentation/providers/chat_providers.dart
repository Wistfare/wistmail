import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/network/providers.dart';
import '../../../../core/realtime/providers.dart';
import '../../../../core/realtime/realtime_event.dart';
import '../../data/chat_remote_data_source.dart';
import '../../data/chat_repository.dart';
import '../../domain/conversation.dart';
import '../../domain/conversation_read.dart';
import '../../domain/message.dart';

final chatRepositoryProvider = FutureProvider<ChatRepository>((ref) async {
  final client = await ref.watch(apiClientProvider.future);
  return ChatRepositoryImpl(ChatRemoteDataSource(client));
});

class ChatListState {
  const ChatListState({
    this.conversations = const [],
    this.isLoading = false,
    this.errorMessage,
    this.hasLoaded = false,
  });

  final List<Conversation> conversations;
  final bool isLoading;
  final String? errorMessage;
  final bool hasLoaded;

  ChatListState copyWith({
    List<Conversation>? conversations,
    bool? isLoading,
    String? errorMessage,
    bool clearError = false,
    bool? hasLoaded,
  }) => ChatListState(
    conversations: conversations ?? this.conversations,
    isLoading: isLoading ?? this.isLoading,
    errorMessage: clearError ? null : (errorMessage ?? this.errorMessage),
    hasLoaded: hasLoaded ?? this.hasLoaded,
  );
}

class ChatListController extends StateNotifier<ChatListState> {
  ChatListController(this._ref) : super(const ChatListState()) {
    load();
    _subscribeToRealtime();
  }

  final Ref _ref;
  ProviderSubscription<AsyncValue<RealtimeEvent>>? _eventSub;

  Future<void> load() async {
    state = state.copyWith(isLoading: true, clearError: true);
    try {
      final repo = await _ref.read(chatRepositoryProvider.future);
      final conversations = await repo.listConversations();
      state = state.copyWith(
        conversations: conversations,
        isLoading: false,
        hasLoaded: true,
      );
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        errorMessage: _format(e),
        hasLoaded: true,
      );
    }
  }

  Future<void> refresh() => load();

  void _subscribeToRealtime() {
    _eventSub = _ref.listen<AsyncValue<RealtimeEvent>>(
      realtimeEventStreamProvider,
      (prev, next) {
        next.whenData(_applyRealtimeEvent);
      },
    );
  }

  Future<void> _applyRealtimeEvent(RealtimeEvent event) async {
    switch (event) {
      case ChatMessageNewEvent e:
        // Bump the relevant conversation to the top and update its last message.
        final idx = state.conversations.indexWhere(
          (c) => c.id == e.conversationId,
        );
        if (idx < 0) {
          // Unknown conversation — refresh the list.
          await refresh();
          return;
        }
        final existing = state.conversations[idx];
        final updated = existing.copyWith(
          lastMessageAt: e.createdAt,
          unreadCount: existing.unreadCount + 1,
          lastMessage: LastMessage(
            id: e.messageId,
            content: e.content,
            senderId: e.senderId,
            createdAt: e.createdAt,
          ),
        );
        final next = [
          updated,
          ...state.conversations.sublist(0, idx),
          ...state.conversations.sublist(idx + 1),
        ];
        state = state.copyWith(conversations: next);
      default:
        break;
    }
  }

  String _format(Object error) {
    final msg = error.toString();
    final match = RegExp(r'ApiException\([^)]*\):\s*(.*)$').firstMatch(msg);
    return match != null ? match.group(1)! : 'Could not load conversations.';
  }

  @override
  void dispose() {
    _eventSub?.close();
    super.dispose();
  }
}

final chatListControllerProvider =
    StateNotifierProvider<ChatListController, ChatListState>(
      (ref) => ChatListController(ref),
    );

final chatUnreadCountProvider = Provider<int>(
  (ref) => ref.watch(
    chatListControllerProvider.select(
      (s) => s.conversations.fold<int>(0, (sum, c) => sum + c.unreadCount),
    ),
  ),
);

/// One live typer in a conversation. Each entry expires `expiresAt`
/// milliseconds after the most recent ping; the controller sweeps
/// expired entries on a 1s timer so the indicator fades out without
/// a dedicated "stopped" event.
class TypingTyper {
  const TypingTyper({
    required this.typerId,
    required this.typerName,
    required this.expiresAt,
  });

  final String typerId;
  final String typerName;
  final DateTime expiresAt;
}

class ConversationState {
  const ConversationState({
    this.messages = const [],
    this.reads = const [],
    this.typers = const [],
    this.pendingAttachments = const [],
    this.isLoading = false,
    this.errorMessage,
    this.isSending = false,
    this.isUploading = false,
  });

  final List<Message> messages;
  /// Per-message read receipts, refetched when the conversation
  /// opens and whenever a `chat.conversation.read` arrives.
  final List<ConversationReadEntry> reads;
  /// Live typers (excluding the current user). Auto-expired by the
  /// controller's 1s sweep.
  final List<TypingTyper> typers;
  /// Attachments uploaded but not yet committed by a `send`. The
  /// composer renders these as removable chips.
  final List<MessageAttachment> pendingAttachments;
  final bool isLoading;
  final String? errorMessage;
  final bool isSending;
  /// True while a file upload is in flight (paperclip → spinner).
  final bool isUploading;

  ConversationState copyWith({
    List<Message>? messages,
    List<ConversationReadEntry>? reads,
    List<TypingTyper>? typers,
    List<MessageAttachment>? pendingAttachments,
    bool? isLoading,
    String? errorMessage,
    bool clearError = false,
    bool? isSending,
    bool? isUploading,
  }) => ConversationState(
    messages: messages ?? this.messages,
    reads: reads ?? this.reads,
    typers: typers ?? this.typers,
    pendingAttachments: pendingAttachments ?? this.pendingAttachments,
    isLoading: isLoading ?? this.isLoading,
    errorMessage: clearError ? null : (errorMessage ?? this.errorMessage),
    isSending: isSending ?? this.isSending,
    isUploading: isUploading ?? this.isUploading,
  );
}

class ConversationController extends StateNotifier<ConversationState> {
  ConversationController(this._ref, this._conversationId)
    : super(const ConversationState(isLoading: true)) {
    _load();
    _subscribeToRealtime();
    _typingSweep = Timer.periodic(const Duration(seconds: 1), (_) {
      _expireStaleTypers();
    });
  }

  final Ref _ref;
  final String _conversationId;
  ProviderSubscription<AsyncValue<RealtimeEvent>>? _eventSub;
  Timer? _typingSweep;
  // Last successful typing-ping timestamp — keeps emit rate to once
  // per ~3 s while keystrokes are flowing.
  DateTime _lastTypingNotify = DateTime.fromMillisecondsSinceEpoch(0);

  Future<void> _load() async {
    try {
      final repo = await _ref.read(chatRepositoryProvider.future);
      final messages = await repo.listMessages(_conversationId);
      state = state.copyWith(messages: messages, isLoading: false);
      // Mark the conversation as read when opened.
      unawaited(_markRead());
      // Also pull seen-by state so the "Seen by" row renders on the
      // most-recent self-sent message.
      unawaited(_refreshReads());
    } catch (e) {
      state = state.copyWith(isLoading: false, errorMessage: _format(e));
    }
  }

  Future<void> _markRead() async {
    try {
      final repo = await _ref.read(chatRepositoryProvider.future);
      await repo.markRead(_conversationId);
    } catch (_) {}
  }

  Future<void> _refreshReads() async {
    try {
      final repo = await _ref.read(chatRepositoryProvider.future);
      final reads = await repo.listConversationReads(_conversationId);
      state = state.copyWith(reads: reads);
    } catch (_) {}
  }

  /// Edit one of *this user's own* messages. Caller is responsible
  /// for permissions; the server gates anyway.
  Future<bool> editMessage({
    required String messageId,
    required String senderId,
    required String content,
  }) async {
    final trimmed = content.trim();
    if (trimmed.isEmpty) return false;
    try {
      final repo = await _ref.read(chatRepositoryProvider.future);
      final updated = await repo.editMessage(
        messageId: messageId,
        conversationId: _conversationId,
        senderId: senderId,
        content: trimmed,
      );
      state = state.copyWith(
        messages: state.messages
            .map((m) => m.id == messageId
                ? m.copyWith(content: updated.content, editedAt: updated.editedAt)
                : m)
            .toList(),
      );
      return true;
    } catch (e) {
      state = state.copyWith(errorMessage: _format(e));
      return false;
    }
  }

  Future<bool> deleteMessage(String messageId) async {
    try {
      final repo = await _ref.read(chatRepositoryProvider.future);
      final deletedAt = await repo.deleteMessage(
        conversationId: _conversationId,
        messageId: messageId,
      );
      state = state.copyWith(
        messages: state.messages
            .map((m) => m.id == messageId
                ? m.copyWith(content: '', deletedAt: deletedAt)
                : m)
            .toList(),
      );
      // The conversation list preview may need to fall back to an
      // older message — let the list controller refresh.
      _ref.invalidate(chatListControllerProvider);
      return true;
    } catch (e) {
      state = state.copyWith(errorMessage: _format(e));
      return false;
    }
  }

  Future<bool> send({required String senderId, required String content}) async {
    final trimmed = content.trim();
    final pending = state.pendingAttachments;
    if (trimmed.isEmpty && pending.isEmpty) return false;
    state = state.copyWith(isSending: true, clearError: true);
    try {
      final repo = await _ref.read(chatRepositoryProvider.future);
      final message = await repo.sendMessage(
        conversationId: _conversationId,
        senderId: senderId,
        content: trimmed,
        attachmentIds:
            pending.isEmpty ? null : pending.map((a) => a.id).toList(),
      );
      // Echo the sent message into the local list with its
      // attachments so the bubble renders chips immediately
      // (the server will only push events to *other* devices).
      final echoed = message.copyWith(attachments: pending);
      state = state.copyWith(
        messages: [...state.messages, echoed],
        pendingAttachments: const [],
        isSending: false,
      );
      return true;
    } catch (e) {
      // Keep pending attachments around so the user can retry without
      // re-uploading.
      state = state.copyWith(isSending: false, errorMessage: _format(e));
      return false;
    }
  }

  /// Add an already-uploaded attachment to the composer's pending
  /// list. Called by the picker flow after `uploadAttachment`
  /// returns.
  Future<bool> uploadAndStageAttachment({
    required List<int> bytes,
    required String filename,
    required String contentType,
  }) async {
    state = state.copyWith(isUploading: true, clearError: true);
    try {
      final repo = await _ref.read(chatRepositoryProvider.future);
      final att = await repo.uploadAttachment(
        bytes: bytes,
        filename: filename,
        contentType: contentType,
      );
      state = state.copyWith(
        pendingAttachments: [...state.pendingAttachments, att],
        isUploading: false,
      );
      return true;
    } catch (e) {
      state = state.copyWith(
        isUploading: false,
        errorMessage: _format(e),
      );
      return false;
    }
  }

  void removePendingAttachment(String attachmentId) {
    state = state.copyWith(
      pendingAttachments: state.pendingAttachments
          .where((a) => a.id != attachmentId)
          .toList(),
    );
  }

  void _subscribeToRealtime() {
    _eventSub = _ref.listen<AsyncValue<RealtimeEvent>>(
      realtimeEventStreamProvider,
      (prev, next) {
        next.whenData((event) {
          if (event is ChatMessageNewEvent &&
              event.conversationId == _conversationId) {
            // Avoid double-append if our own echo came back.
            if (state.messages.any((m) => m.id == event.messageId)) return;
            final message = Message(
              id: event.messageId,
              conversationId: event.conversationId,
              senderId: event.senderId,
              content: event.content,
              createdAt: event.createdAt,
            );
            state = state.copyWith(messages: [...state.messages, message]);
            unawaited(_markRead());
          } else if (event is ChatMessageUpdatedEvent &&
              event.conversationId == _conversationId) {
            state = state.copyWith(
              messages: state.messages
                  .map((m) => m.id == event.messageId
                      ? m.copyWith(
                          content: event.content,
                          editedAt: event.editedAt,
                        )
                      : m)
                  .toList(),
            );
          } else if (event is ChatMessageDeletedEvent &&
              event.conversationId == _conversationId) {
            state = state.copyWith(
              messages: state.messages
                  .map((m) => m.id == event.messageId
                      ? m.copyWith(content: '', deletedAt: event.deletedAt)
                      : m)
                  .toList(),
            );
          } else if (event is ChatConversationReadEvent &&
              event.conversationId == _conversationId) {
            // Refetch reads on demand — avoids racing the server's
            // bulk insert by going back to the source of truth.
            unawaited(_refreshReads());
          } else if (event is ChatTypingEvent &&
              event.conversationId == _conversationId) {
            _applyTypingPing(event.typerId, event.typerName);
          }
        });
      },
    );
  }

  /// Best-effort typing ping with a 3 s debounce. Called from the
  /// composer's onChange so the server only hears from us at most
  /// once every 3 s while keystrokes are flowing.
  void notifyTyping() {
    final now = DateTime.now();
    if (now.difference(_lastTypingNotify) < const Duration(seconds: 3)) {
      return;
    }
    _lastTypingNotify = now;
    () async {
      try {
        final repo = await _ref.read(chatRepositoryProvider.future);
        await repo.notifyTyping(_conversationId);
      } catch (_) {
        // ignore — pings are best-effort
      }
    }();
  }

  void _applyTypingPing(String typerId, String typerName) {
    final expiresAt = DateTime.now().add(const Duration(seconds: 5));
    final next = state.typers
        .where((t) => t.typerId != typerId)
        .toList()
      ..add(TypingTyper(
        typerId: typerId,
        typerName: typerName,
        expiresAt: expiresAt,
      ));
    state = state.copyWith(typers: next);
  }

  void _expireStaleTypers() {
    if (state.typers.isEmpty) return;
    final now = DateTime.now();
    final live = state.typers.where((t) => t.expiresAt.isAfter(now)).toList();
    if (live.length != state.typers.length) {
      state = state.copyWith(typers: live);
    }
  }

  String _format(Object error) {
    final msg = error.toString();
    final match = RegExp(r'ApiException\([^)]*\):\s*(.*)$').firstMatch(msg);
    return match != null ? match.group(1)! : 'Could not load messages.';
  }

  @override
  void dispose() {
    _typingSweep?.cancel();
    _eventSub?.close();
    super.dispose();
  }
}

final conversationControllerProvider = StateNotifierProvider.autoDispose
    .family<ConversationController, ConversationState, String>(
      (ref, id) => ConversationController(ref, id),
    );
