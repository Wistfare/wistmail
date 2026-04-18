import '../../../core/network/api_client.dart';
import '../domain/conversation.dart';
import '../domain/message.dart';

class ChatRemoteDataSource {
  ChatRemoteDataSource(this._client);
  final ApiClient _client;

  Future<List<Conversation>> listConversations() async {
    final response = await _client.dio.get<Map<String, dynamic>>(
      '/api/v1/chat/conversations',
    );
    final raw = response.data?['conversations'] as List<dynamic>? ?? const [];
    return raw
        .map((c) => Conversation.fromJson(c as Map<String, dynamic>))
        .toList();
  }

  Future<String> createDirectConversation(String userEmail) async {
    final response = await _client.dio.post<Map<String, dynamic>>(
      '/api/v1/chat/conversations',
      data: {'userEmail': userEmail},
    );
    return response.data!['id'] as String;
  }

  Future<List<Message>> listMessages(String conversationId) async {
    final response = await _client.dio.get<Map<String, dynamic>>(
      '/api/v1/chat/conversations/$conversationId/messages',
    );
    final raw = response.data?['messages'] as List<dynamic>? ?? const [];
    return raw.map((m) => Message.fromJson(m as Map<String, dynamic>)).toList();
  }

  Future<Message> sendMessage({
    required String conversationId,
    required String senderId,
    required String content,
  }) async {
    final response = await _client.dio.post<Map<String, dynamic>>(
      '/api/v1/chat/conversations/$conversationId/messages',
      data: {'content': content},
    );
    final data = response.data!;
    return Message(
      id: data['id'] as String,
      conversationId: conversationId,
      senderId: senderId,
      content: content,
      createdAt: DateTime.parse(data['createdAt'] as String).toLocal(),
    );
  }

  Future<void> markRead(String conversationId) async {
    await _client.dio.post<Map<String, dynamic>>(
      '/api/v1/chat/conversations/$conversationId/read',
    );
  }
}
