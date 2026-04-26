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

  group('ChatRemoteDataSource.searchUsers', () {
    test('returns parsed contacts', () async {
      final builder = FakeApiClientBuilder()
        ..on('GET', '/api/v1/chat/users/search', body: {
          'users': [
            {
              'id': 'u_a',
              'name': 'Alex Chen',
              'email': 'alex@wistfare.com',
              'avatarUrl': null,
            },
            {
              'id': 'u_b',
              'name': 'Bob',
              'email': 'bob@wistfare.com',
              'avatarUrl': 'https://x/y.png',
            },
          ],
        });

      final ds = ChatRemoteDataSource(builder.build());
      final results = await ds.searchUsers('al');
      expect(results.length, 2);
      expect(results.first.email, 'alex@wistfare.com');
      expect(results[1].avatarUrl, 'https://x/y.png');
      expect(builder.capturedRequests.single.queryParameters['q'], 'al');
    });

    test('returns empty list and skips network for blank query', () async {
      final builder = FakeApiClientBuilder();
      final ds = ChatRemoteDataSource(builder.build());
      final results = await ds.searchUsers('   ');
      expect(results, isEmpty);
      expect(builder.capturedRequests, isEmpty);
    });
  });

  group('ChatRemoteDataSource.createGroupConversation', () {
    test('POSTs title + participantIds and returns id', () async {
      final builder = FakeApiClientBuilder()
        ..on('POST', '/api/v1/chat/conversations/group',
            status: 201, body: {'id': 'cnv_g1'});

      final ds = ChatRemoteDataSource(builder.build());
      final id = await ds.createGroupConversation(
        title: 'Engineering',
        participantIds: ['u_a', 'u_b'],
      );
      expect(id, 'cnv_g1');
      final data = builder.capturedRequests.single.data as Map;
      expect(data['title'], 'Engineering');
      expect(data['participantIds'], ['u_a', 'u_b']);
    });
  });

  group('ChatRemoteDataSource.listParticipants', () {
    test('returns parsed contact list', () async {
      final builder = FakeApiClientBuilder()
        ..on('GET', '/api/v1/chat/conversations/c1/participants', body: {
          'participants': [
            {
              'id': 'u_a',
              'name': 'Alex',
              'email': 'alex@x.com',
              'avatarUrl': null,
            },
            {
              'id': 'u_b',
              'name': 'Bo',
              'email': 'bo@x.com',
              'avatarUrl': null,
            },
          ],
        });
      final ds = ChatRemoteDataSource(builder.build());
      final list = await ds.listParticipants('c1');
      expect(list.length, 2);
      expect(list.first.email, 'alex@x.com');
    });
  });

  group('ChatRemoteDataSource.addParticipants', () {
    test('returns the server-reported added IDs', () async {
      final builder = FakeApiClientBuilder()
        ..on('POST', '/api/v1/chat/conversations/c1/participants',
            body: {'added': ['u_b', 'u_c']});

      final ds = ChatRemoteDataSource(builder.build());
      final added = await ds.addParticipants(
        conversationId: 'c1',
        userIds: ['u_a', 'u_b', 'u_c'],
      );
      expect(added, ['u_b', 'u_c']);
      final data = builder.capturedRequests.single.data as Map;
      expect(data['userIds'], ['u_a', 'u_b', 'u_c']);
    });
  });

  group('ChatRemoteDataSource.removeParticipant', () {
    test('issues a DELETE on the participant endpoint', () async {
      final builder = FakeApiClientBuilder()
        ..on('DELETE', '/api/v1/chat/conversations/c1/participants/u_b',
            body: {'ok': true});

      final ds = ChatRemoteDataSource(builder.build());
      await ds.removeParticipant(conversationId: 'c1', userId: 'u_b');
      expect(builder.capturedRequests.single.path,
          '/api/v1/chat/conversations/c1/participants/u_b');
      expect(builder.capturedRequests.single.method, 'DELETE');
    });
  });

  group('ChatRemoteDataSource.editMessage', () {
    test('PATCHes the nested URL and returns the synthesized message', () async {
      final builder = FakeApiClientBuilder()
        ..on('PATCH', '/api/v1/chat/conversations/c1/messages/m1', body: {
          'id': 'm1',
          'content': 'updated body',
          'editedAt': '2026-04-26T10:00:00Z',
        });
      final ds = ChatRemoteDataSource(builder.build());
      final message = await ds.editMessage(
        messageId: 'm1',
        conversationId: 'c1',
        senderId: 'u_a',
        content: 'updated body',
      );
      expect(message.id, 'm1');
      expect(message.content, 'updated body');
      expect(message.editedAt, isNotNull);
      final captured = builder.capturedRequests.single;
      expect(captured.path, '/api/v1/chat/conversations/c1/messages/m1');
      final data = captured.data as Map;
      expect(data['content'], 'updated body');
    });
  });

  group('ChatRemoteDataSource.deleteMessage', () {
    test('DELETEs the nested URL and returns the deletion timestamp', () async {
      final builder = FakeApiClientBuilder()
        ..on('DELETE', '/api/v1/chat/conversations/c1/messages/m1',
            body: {'id': 'm1', 'deletedAt': '2026-04-26T10:05:00Z'});
      final ds = ChatRemoteDataSource(builder.build());
      final ts = await ds.deleteMessage(
        conversationId: 'c1',
        messageId: 'm1',
      );
      expect(ts, isNotNull);
      expect(builder.capturedRequests.single.path,
          '/api/v1/chat/conversations/c1/messages/m1');
    });
  });

  group('ChatRemoteDataSource.listConversationReads', () {
    test('returns parsed read entries', () async {
      final builder = FakeApiClientBuilder()
        ..on('GET', '/api/v1/chat/conversations/c1/reads', body: {
          'reads': [
            {
              'messageId': 'm1',
              'userId': 'u_b',
              'readAt': '2026-04-26T10:10:00Z',
            },
            {
              'messageId': 'm2',
              'userId': 'u_b',
              'readAt': '2026-04-26T10:11:00Z',
            },
          ],
        });
      final ds = ChatRemoteDataSource(builder.build());
      final reads = await ds.listConversationReads('c1');
      expect(reads.length, 2);
      expect(reads.first.messageId, 'm1');
      expect(reads.first.userId, 'u_b');
    });
  });

  group('ChatRemoteDataSource.notifyTyping', () {
    test('POSTs to the typing endpoint', () async {
      final builder = FakeApiClientBuilder()
        ..on('POST', '/api/v1/chat/conversations/c1/typing', body: {'ok': true});
      final ds = ChatRemoteDataSource(builder.build());
      await ds.notifyTyping('c1');
      expect(builder.capturedRequests.single.path,
          '/api/v1/chat/conversations/c1/typing');
    });

    test('swallows network errors silently', () async {
      // The endpoint is unregistered → fake throws under the hood. The
      // method should not propagate the error.
      final builder = FakeApiClientBuilder();
      final ds = ChatRemoteDataSource(builder.build());
      await ds.notifyTyping('c1'); // must not throw
    });
  });

  group('ChatRemoteDataSource.searchMessages', () {
    test('returns parsed hits with available=true by default', () async {
      final builder = FakeApiClientBuilder()
        ..on('GET', '/api/v1/chat/search', body: {
          'hits': [
            {
              'messageId': 'm1',
              'conversationId': 'c1',
              'conversationTitle': null,
              'senderId': 'u_a',
              'senderName': 'Alex',
              'content': 'hello world',
              'createdAt': '2026-04-26T10:00:00Z',
            },
          ],
          'total': 1,
        });
      final ds = ChatRemoteDataSource(builder.build());
      final result = await ds.searchMessages('hello');
      expect(result.hits, hasLength(1));
      expect(result.hits.first.messageId, 'm1');
      expect(result.available, isTrue);
      expect(builder.capturedRequests.single.queryParameters['q'], 'hello');
    });

    test('forwards available=false when search is not configured', () async {
      final builder = FakeApiClientBuilder()
        ..on('GET', '/api/v1/chat/search', body: {
          'hits': [],
          'total': 0,
          'available': false,
        });
      final ds = ChatRemoteDataSource(builder.build());
      final result = await ds.searchMessages('hello');
      expect(result.hits, isEmpty);
      expect(result.available, isFalse);
    });

    test('returns empty result and skips network for blank query', () async {
      final builder = FakeApiClientBuilder();
      final ds = ChatRemoteDataSource(builder.build());
      final result = await ds.searchMessages('   ');
      expect(result.hits, isEmpty);
      expect(result.available, isTrue);
      expect(builder.capturedRequests, isEmpty);
    });
  });

  group('ChatRemoteDataSource.attachmentUrl', () {
    test('joins base url + nested attachment path', () {
      final builder = FakeApiClientBuilder();
      final ds = ChatRemoteDataSource(builder.build());
      final url = ds.attachmentUrl(
        conversationId: 'c1',
        attachmentId: 'cat_abc',
      );
      // FakeApiClientBuilder uses an empty base URL; the path should
      // still be properly nested.
      expect(url, contains('/api/v1/chat/conversations/c1/attachments/cat_abc'));
    });
  });
}
