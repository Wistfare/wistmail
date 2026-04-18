import '../domain/conversation.dart';
import '../domain/message.dart';
import 'chat_remote_data_source.dart';

abstract class ChatRepository {
  Future<List<Conversation>> listConversations();
  Future<String> createDirectConversation(String userEmail);
  Future<List<Message>> listMessages(String conversationId);
  Future<Message> sendMessage({
    required String conversationId,
    required String senderId,
    required String content,
  });
  Future<void> markRead(String conversationId);
}

class ChatRepositoryImpl implements ChatRepository {
  ChatRepositoryImpl(this._remote);
  final ChatRemoteDataSource _remote;

  @override
  Future<List<Conversation>> listConversations() => _remote.listConversations();

  @override
  Future<String> createDirectConversation(String userEmail) =>
      _remote.createDirectConversation(userEmail);

  @override
  Future<List<Message>> listMessages(String conversationId) =>
      _remote.listMessages(conversationId);

  @override
  Future<Message> sendMessage({
    required String conversationId,
    required String senderId,
    required String content,
  }) =>
      _remote.sendMessage(
        conversationId: conversationId,
        senderId: senderId,
        content: content,
      );

  @override
  Future<void> markRead(String conversationId) => _remote.markRead(conversationId);
}
