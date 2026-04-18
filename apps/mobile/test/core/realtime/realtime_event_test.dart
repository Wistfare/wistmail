import 'package:flutter_test/flutter_test.dart';
import 'package:wistmail/core/realtime/realtime_event.dart';

void main() {
  group('RealtimeEvent.fromJson', () {
    test('decodes connection.ready', () {
      final event = RealtimeEvent.fromJson({'type': 'connection.ready', 'userId': 'u_1'});
      expect(event, isA<ConnectionReadyEvent>());
    });

    test('decodes email.new with all fields', () {
      final event = RealtimeEvent.fromJson({
        'type': 'email.new',
        'userId': 'u_1',
        'emailId': 'e1',
        'mailboxId': 'mbx_1',
        'folder': 'inbox',
        'fromAddress': 'alex@x.com',
        'subject': 'Hello',
        'preview': 'short',
        'createdAt': '2026-01-01T00:00:00Z',
      }) as EmailNewEvent;

      expect(event.emailId, 'e1');
      expect(event.mailboxId, 'mbx_1');
      expect(event.folder, 'inbox');
      expect(event.subject, 'Hello');
      expect(event.createdAt.year, 2026);
    });

    test('decodes email.updated with partial changes', () {
      final event = RealtimeEvent.fromJson({
        'type': 'email.updated',
        'userId': 'u_1',
        'emailId': 'e1',
        'changes': {'isRead': true},
      }) as EmailUpdatedEvent;

      expect(event.isRead, true);
      expect(event.isStarred, null);
      expect(event.folder, null);
    });

    test('decodes email.deleted', () {
      final event = RealtimeEvent.fromJson({
        'type': 'email.deleted',
        'userId': 'u_1',
        'emailId': 'e1',
      }) as EmailDeletedEvent;
      expect(event.emailId, 'e1');
    });

    test('decodes chat.message.new', () {
      final event = RealtimeEvent.fromJson({
        'type': 'chat.message.new',
        'userId': 'u_1',
        'conversationId': 'c1',
        'messageId': 'm1',
        'senderId': 'u_2',
        'content': 'hi',
        'createdAt': '2026-01-01T00:00:00Z',
      }) as ChatMessageNewEvent;

      expect(event.conversationId, 'c1');
      expect(event.messageId, 'm1');
      expect(event.content, 'hi');
    });

    test('returns null for unknown event types', () {
      final event = RealtimeEvent.fromJson({'type': 'something.unknown'});
      expect(event, null);
    });
  });
}
