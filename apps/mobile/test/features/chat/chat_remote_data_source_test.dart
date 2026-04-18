import 'package:flutter_test/flutter_test.dart';
import 'package:wistmail/features/chat/data/chat_remote_data_source.dart';

import '../../helpers/fake_api_client.dart';

Map<String, dynamic> _conv(String id) => {
      'id': id,
      'kind': 'direct',
      'title': null,
      'otherParticipants': [
        {'id': 'u_other', 'name': 'Alex Chen', 'email': 'alex@x.com'},
      ],
      'lastMessageAt': '2026-01-01T10:00:00Z',
      'unreadCount': 0,
      'lastMessage': null,
    };

Map<String, dynamic> _msg(String id) => {
      'id': id,
      'conversationId': 'c1',
      'senderId': 'u_1',
      'content': 'hello',
      'createdAt': '2026-01-01T10:00:00Z',
    };

void main() {
  group('ChatRemoteDataSource.listConversations', () {
    test('returns parsed conversations', () async {
      final builder = FakeApiClientBuilder()
        ..on('GET', '/api/v1/chat/conversations', body: {
          'conversations': [_conv('c1'), _conv('c2')],
        });

      final ds = ChatRemoteDataSource(builder.build());
      final list = await ds.listConversations();
      expect(list.length, 2);
      expect(list.first.id, 'c1');
    });
  });

  group('ChatRemoteDataSource.createDirectConversation', () {
    test('returns id from response', () async {
      final builder = FakeApiClientBuilder()
        ..on('POST', '/api/v1/chat/conversations', status: 201, body: {'id': 'c_new'});

      final ds = ChatRemoteDataSource(builder.build());
      final id = await ds.createDirectConversation('other@wistfare.com');
      expect(id, 'c_new');
    });
  });

  group('ChatRemoteDataSource.listMessages', () {
    test('returns parsed messages', () async {
      final builder = FakeApiClientBuilder()
        ..on('GET', '/api/v1/chat/conversations/c1/messages', body: {
          'messages': [_msg('m1'), _msg('m2')],
        });

      final ds = ChatRemoteDataSource(builder.build());
      final list = await ds.listMessages('c1');
      expect(list.length, 2);
      expect(list.first.id, 'm1');
    });
  });

  group('ChatRemoteDataSource.sendMessage', () {
    test('POSTs content and constructs Message', () async {
      final builder = FakeApiClientBuilder()
        ..on('POST', '/api/v1/chat/conversations/c1/messages',
            status: 201,
            body: {'id': 'm_new', 'createdAt': '2026-01-01T10:00:00Z'});

      final ds = ChatRemoteDataSource(builder.build());
      final message = await ds.sendMessage(
        conversationId: 'c1',
        senderId: 'u_1',
        content: 'hi',
      );

      expect(message.id, 'm_new');
      expect(message.senderId, 'u_1');
      expect(message.content, 'hi');
      final data = builder.capturedRequests.single.data as Map;
      expect(data['content'], 'hi');
    });
  });

  group('ChatRemoteDataSource.markRead', () {
    test('posts to read endpoint', () async {
      final builder = FakeApiClientBuilder()
        ..on('POST', '/api/v1/chat/conversations/c1/read', body: {'ok': true});

      final ds = ChatRemoteDataSource(builder.build());
      await ds.markRead('c1');
      expect(builder.capturedRequests.single.path, '/api/v1/chat/conversations/c1/read');
    });
  });
}
