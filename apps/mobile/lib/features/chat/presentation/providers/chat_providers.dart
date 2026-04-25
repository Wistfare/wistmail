import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/network/providers.dart';
import '../../../../core/realtime/providers.dart';
import '../../../../core/realtime/realtime_event.dart';
import '../../data/chat_remote_data_source.dart';
import '../../data/chat_repository.dart';
import '../../domain/conversation.dart';
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

class ConversationState {
  const ConversationState({
    this.messages = const [],
    this.isLoading = false,
    this.errorMessage,
    this.isSending = false,
  });

  final List<Message> messages;
  final bool isLoading;
  final String? errorMessage;
  final bool isSending;

  ConversationState copyWith({
    List<Message>? messages,
    bool? isLoading,
    String? errorMessage,
    bool clearError = false,
    bool? isSending,
  }) => ConversationState(
    messages: messages ?? this.messages,
    isLoading: isLoading ?? this.isLoading,
    errorMessage: clearError ? null : (errorMessage ?? this.errorMessage),
    isSending: isSending ?? this.isSending,
  );
}

class ConversationController extends StateNotifier<ConversationState> {
  ConversationController(this._ref, this._conversationId)
    : super(const ConversationState(isLoading: true)) {
    _load();
    _subscribeToRealtime();
  }

  final Ref _ref;
  final String _conversationId;
  ProviderSubscription<AsyncValue<RealtimeEvent>>? _eventSub;

  Future<void> _load() async {
    try {
      final repo = await _ref.read(chatRepositoryProvider.future);
      final messages = await repo.listMessages(_conversationId);
      state = state.copyWith(messages: messages, isLoading: false);
      // Mark the conversation as read when opened.
      unawaited(_markRead());
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

  Future<bool> send({required String senderId, required String content}) async {
    final trimmed = content.trim();
    if (trimmed.isEmpty) return false;
    state = state.copyWith(isSending: true, clearError: true);
    try {
      final repo = await _ref.read(chatRepositoryProvider.future);
      final message = await repo.sendMessage(
        conversationId: _conversationId,
        senderId: senderId,
        content: trimmed,
      );
      state = state.copyWith(
        messages: [...state.messages, message],
        isSending: false,
      );
      return true;
    } catch (e) {
      state = state.copyWith(isSending: false, errorMessage: _format(e));
      return false;
    }
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
          }
        });
      },
    );
  }

  String _format(Object error) {
    final msg = error.toString();
    final match = RegExp(r'ApiException\([^)]*\):\s*(.*)$').firstMatch(msg);
    return match != null ? match.group(1)! : 'Could not load messages.';
  }

  @override
  void dispose() {
    _eventSub?.close();
    super.dispose();
  }
}

final conversationControllerProvider = StateNotifierProvider.autoDispose
    .family<ConversationController, ConversationState, String>(
      (ref, id) => ConversationController(ref, id),
    );
