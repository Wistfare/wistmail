import 'package:dio/dio.dart';
import '../../../core/network/api_client.dart';
import '../domain/chat_search_hit.dart';
import '../domain/contact.dart';
import '../domain/conversation.dart';
import '../domain/conversation_read.dart';
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
    List<String>? attachmentIds,
  }) async {
    final body = <String, Object>{'content': content};
    if (attachmentIds != null && attachmentIds.isNotEmpty) {
      body['attachmentIds'] = attachmentIds;
    }
    final response = await _client.dio.post<Map<String, dynamic>>(
      '/api/v1/chat/conversations/$conversationId/messages',
      data: body,
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

  /// Stage an attachment upload. Returns the row info — caller
  /// passes the `id` into `sendMessage` via `attachmentIds`. Dio
  /// reads file bytes synchronously into memory; for chat we cap
  /// at 25 MB on the server, so this stays well within mobile RAM.
  Future<MessageAttachment> uploadAttachment({
    required List<int> bytes,
    required String filename,
    required String contentType,
  }) async {
    final form = FormData.fromMap({
      'file': MultipartFile.fromBytes(
        bytes,
        filename: filename,
        contentType: DioMediaType.parse(contentType),
      ),
    });
    final response = await _client.dio.post<Map<String, dynamic>>(
      '/api/v1/chat/attachments',
      data: form,
      options: Options(contentType: 'multipart/form-data'),
    );
    final data = response.data!;
    return MessageAttachment(
      id: data['id'] as String,
      filename: (data['filename'] as String?) ?? filename,
      contentType: (data['contentType'] as String?) ?? contentType,
      sizeBytes: (data['sizeBytes'] as num?)?.toInt() ?? bytes.length,
    );
  }

  Future<void> markRead(String conversationId) async {
    await _client.dio.post<Map<String, dynamic>>(
      '/api/v1/chat/conversations/$conversationId/read',
    );
  }

  Future<List<Contact>> searchUsers(String query) async {
    final trimmed = query.trim();
    if (trimmed.isEmpty) return const [];
    final response = await _client.dio.get<Map<String, dynamic>>(
      '/api/v1/chat/users/search',
      queryParameters: {'q': trimmed},
    );
    final raw = response.data?['users'] as List<dynamic>? ?? const [];
    return raw
        .map((u) => Contact.fromJson(u as Map<String, dynamic>))
        .toList();
  }

  Future<String> createGroupConversation({
    required String title,
    required List<String> participantIds,
  }) async {
    final response = await _client.dio.post<Map<String, dynamic>>(
      '/api/v1/chat/conversations/group',
      data: {
        'title': title,
        'participantIds': participantIds,
      },
    );
    return response.data!['id'] as String;
  }

  Future<List<Contact>> listParticipants(String conversationId) async {
    final response = await _client.dio.get<Map<String, dynamic>>(
      '/api/v1/chat/conversations/$conversationId/participants',
    );
    final raw =
        response.data?['participants'] as List<dynamic>? ?? const [];
    return raw
        .map((u) => Contact.fromJson(u as Map<String, dynamic>))
        .toList();
  }

  Future<List<String>> addParticipants({
    required String conversationId,
    required List<String> userIds,
  }) async {
    final response = await _client.dio.post<Map<String, dynamic>>(
      '/api/v1/chat/conversations/$conversationId/participants',
      data: {'userIds': userIds},
    );
    final added = response.data?['added'] as List<dynamic>? ?? const [];
    return added.map((id) => id as String).toList();
  }

  Future<void> removeParticipant({
    required String conversationId,
    required String userId,
  }) async {
    await _client.dio.delete<Map<String, dynamic>>(
      '/api/v1/chat/conversations/$conversationId/participants/$userId',
    );
  }

  Future<Message> editMessage({
    required String messageId,
    required String conversationId,
    required String senderId,
    required String content,
  }) async {
    final response = await _client.dio.patch<Map<String, dynamic>>(
      '/api/v1/chat/conversations/$conversationId/messages/$messageId',
      data: {'content': content},
    );
    final data = response.data!;
    final editedAt =
        DateTime.parse(data['editedAt'] as String).toLocal();
    // The server returns id + new content + editedAt. We synthesize
    // the rest from the call inputs so callers don't need a follow-up
    // GET to refresh the message in their local cache.
    return Message(
      id: data['id'] as String,
      conversationId: conversationId,
      senderId: senderId,
      content: data['content'] as String,
      createdAt: editedAt, // overwritten by the cache merge — only edit timestamp matters
      editedAt: editedAt,
    );
  }

  Future<DateTime> deleteMessage({
    required String conversationId,
    required String messageId,
  }) async {
    final response = await _client.dio.delete<Map<String, dynamic>>(
      '/api/v1/chat/conversations/$conversationId/messages/$messageId',
    );
    final data = response.data!;
    return DateTime.parse(data['deletedAt'] as String).toLocal();
  }

  /// Resolved download URL for an attachment. Used by the bubble's
  /// chip to open the file in the system browser via url_launcher.
  String attachmentUrl({
    required String conversationId,
    required String attachmentId,
  }) {
    final base = _client.dio.options.baseUrl;
    return '$base/api/v1/chat/conversations/$conversationId/attachments/$attachmentId';
  }

  /// Returns the parsed hit list AND whether the server has search
  /// configured. The flag lets the UI differentiate "no matches"
  /// (search ran fine, found nothing) from "not available" (no
  /// MEILI_URL on the server) — the second case can't be fixed by
  /// the user, so the message should be different.
  Future<ChatSearchResult> searchMessages(String query) async {
    final trimmed = query.trim();
    if (trimmed.isEmpty) {
      return const ChatSearchResult(hits: [], available: true);
    }
    final response = await _client.dio.get<Map<String, dynamic>>(
      '/api/v1/chat/search',
      queryParameters: {'q': trimmed},
    );
    final raw = response.data?['hits'] as List<dynamic>? ?? const [];
    // The backend omits `available` when search is configured (it
    // returns true implicitly). Default to true so older API
    // responses don't get misread as "not configured".
    final available =
        (response.data?['available'] as bool?) ?? true;
    return ChatSearchResult(
      hits: raw
          .map((h) => ChatSearchHit.fromJson(h as Map<String, dynamic>))
          .toList(),
      available: available,
    );
  }

  Future<void> notifyTyping(String conversationId) async {
    // Fire-and-forget — typing pings are best-effort. Swallow network
    // errors so the composer never surfaces them to the user.
    try {
      await _client.dio.post<Map<String, dynamic>>(
        '/api/v1/chat/conversations/$conversationId/typing',
      );
    } catch (_) {
      // ignore
    }
  }

  Future<List<ConversationReadEntry>> listConversationReads(
    String conversationId,
  ) async {
    final response = await _client.dio.get<Map<String, dynamic>>(
      '/api/v1/chat/conversations/$conversationId/reads',
    );
    final raw = response.data?['reads'] as List<dynamic>? ?? const [];
    return raw
        .map((r) =>
            ConversationReadEntry.fromJson(r as Map<String, dynamic>))
        .toList();
  }
}
