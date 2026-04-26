import '../domain/chat_search_hit.dart' show ChatSearchHit, ChatSearchResult;
import '../domain/contact.dart';
import '../domain/conversation.dart';
import '../domain/conversation_read.dart';
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
    List<String>? attachmentIds,
  });
  Future<MessageAttachment> uploadAttachment({
    required List<int> bytes,
    required String filename,
    required String contentType,
  });
  Future<void> markRead(String conversationId);
  Future<List<Contact>> searchUsers(String query);
  Future<String> createGroupConversation({
    required String title,
    required List<String> participantIds,
  });
  Future<List<Contact>> listParticipants(String conversationId);
  Future<List<String>> addParticipants({
    required String conversationId,
    required List<String> userIds,
  });
  Future<void> removeParticipant({
    required String conversationId,
    required String userId,
  });
  Future<Message> editMessage({
    required String messageId,
    required String conversationId,
    required String senderId,
    required String content,
  });
  Future<DateTime> deleteMessage({
    required String conversationId,
    required String messageId,
  });
  Future<List<ConversationReadEntry>> listConversationReads(
    String conversationId,
  );
  Future<void> notifyTyping(String conversationId);
  Future<ChatSearchResult> searchMessages(String query);
  String attachmentUrl({
    required String conversationId,
    required String attachmentId,
  });
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
    List<String>? attachmentIds,
  }) =>
      _remote.sendMessage(
        conversationId: conversationId,
        senderId: senderId,
        content: content,
        attachmentIds: attachmentIds,
      );

  @override
  Future<MessageAttachment> uploadAttachment({
    required List<int> bytes,
    required String filename,
    required String contentType,
  }) =>
      _remote.uploadAttachment(
        bytes: bytes,
        filename: filename,
        contentType: contentType,
      );

  @override
  Future<void> markRead(String conversationId) => _remote.markRead(conversationId);

  @override
  Future<List<Contact>> searchUsers(String query) => _remote.searchUsers(query);

  @override
  Future<String> createGroupConversation({
    required String title,
    required List<String> participantIds,
  }) =>
      _remote.createGroupConversation(
        title: title,
        participantIds: participantIds,
      );

  @override
  Future<List<Contact>> listParticipants(String conversationId) =>
      _remote.listParticipants(conversationId);

  @override
  Future<List<String>> addParticipants({
    required String conversationId,
    required List<String> userIds,
  }) =>
      _remote.addParticipants(
        conversationId: conversationId,
        userIds: userIds,
      );

  @override
  Future<void> removeParticipant({
    required String conversationId,
    required String userId,
  }) =>
      _remote.removeParticipant(
        conversationId: conversationId,
        userId: userId,
      );

  @override
  Future<Message> editMessage({
    required String messageId,
    required String conversationId,
    required String senderId,
    required String content,
  }) =>
      _remote.editMessage(
        messageId: messageId,
        conversationId: conversationId,
        senderId: senderId,
        content: content,
      );

  @override
  Future<DateTime> deleteMessage({
    required String conversationId,
    required String messageId,
  }) =>
      _remote.deleteMessage(
        conversationId: conversationId,
        messageId: messageId,
      );

  @override
  Future<List<ConversationReadEntry>> listConversationReads(
    String conversationId,
  ) =>
      _remote.listConversationReads(conversationId);

  @override
  Future<void> notifyTyping(String conversationId) =>
      _remote.notifyTyping(conversationId);

  @override
  Future<ChatSearchResult> searchMessages(String query) =>
      _remote.searchMessages(query);

  @override
  String attachmentUrl({
    required String conversationId,
    required String attachmentId,
  }) =>
      _remote.attachmentUrl(
        conversationId: conversationId,
        attachmentId: attachmentId,
      );
}
