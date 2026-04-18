import 'package:flutter_test/flutter_test.dart';
import 'package:wistmail/features/chat/domain/conversation.dart';
import 'package:wistmail/features/chat/domain/message.dart';

Map<String, dynamic> _conv({
  String id = 'c1',
  String kind = 'direct',
  String? title,
  List<Map<String, dynamic>>? others,
  int unread = 0,
  Map<String, dynamic>? lastMessage,
}) =>
    {
      'id': id,
      'kind': kind,
      'title': title,
      'otherParticipants': others ??
          [
            {'id': 'u_other', 'name': 'Alex Chen', 'email': 'alex@x.com'},
          ],
      'lastMessageAt': '2026-01-01T10:00:00Z',
      'unreadCount': unread,
      'lastMessage': lastMessage,
    };

void main() {
  group('Conversation.fromJson', () {
    test('parses direct conversation', () {
      final c = Conversation.fromJson(_conv(
        unread: 3,
        lastMessage: {
          'id': 'm1',
          'content': 'Hey there',
          'senderId': 'u_other',
          'createdAt': '2026-01-01T10:00:00Z',
        },
      ));
      expect(c.id, 'c1');
      expect(c.displayName, 'Alex Chen');
      expect(c.displayInitials, 'AC');
      expect(c.unreadCount, 3);
      expect(c.lastMessage!.content, 'Hey there');
      expect(c.lastMessagePreview, 'Hey there');
    });

    test('group title takes precedence over participants', () {
      final c = Conversation.fromJson(_conv(
        kind: 'group',
        title: 'Product Team',
        others: [
          {'id': 'u1', 'name': 'A', 'email': 'a@x.com'},
          {'id': 'u2', 'name': 'B', 'email': 'b@x.com'},
        ],
      ));
      expect(c.displayName, 'Product Team');
    });

    test('copyWith updates only specified fields', () {
      final c = Conversation.fromJson(_conv(unread: 0));
      final updated = c.copyWith(unreadCount: 5);
      expect(updated.unreadCount, 5);
      expect(updated.id, c.id);
    });
  });

  group('Message.fromJson', () {
    test('parses message', () {
      final m = Message.fromJson({
        'id': 'm1',
        'conversationId': 'c1',
        'senderId': 'u_1',
        'content': 'hi',
        'createdAt': '2026-01-01T10:00:00Z',
      });
      expect(m.id, 'm1');
      expect(m.conversationId, 'c1');
      expect(m.isFromMe('u_1'), true);
      expect(m.isFromMe('u_2'), false);
    });
  });
}
