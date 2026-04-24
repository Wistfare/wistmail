import 'package:flutter_test/flutter_test.dart';
import 'package:wistmail/features/mail/domain/unified_inbox_item.dart';

void main() {
  group('UnifiedInboxItem.fromJson', () {
    test('parses a mail row with needsReply flag', () {
      final item = UnifiedInboxItem.fromJson({
        'source': 'mail',
        'id': 'mail:em_1',
        'occurredAt': '2026-04-23T10:00:00Z',
        'senderName': 'Sarah',
        'senderKey': 'sarah@x.com',
        'preview': 'Storyboard tweaks',
        'subtitle': 'Hey, pushed updates',
        'isUnread': true,
        'mail': {
          'emailId': 'em_1',
          'threadId': 'th_1',
          'fromAddress': 'Sarah <sarah@x.com>',
          'needsReply': true,
        },
      });
      expect(item.source, UnifiedSource.mail);
      expect(item.emailId, 'em_1');
      expect(item.threadId, 'th_1');
      expect(item.needsReply, isTrue);
      expect(item.conversationId, isNull);
      expect(item.isUnread, isTrue);
    });

    test('parses a group-chat row', () {
      final item = UnifiedInboxItem.fromJson({
        'source': 'chat',
        'id': 'chat:msg_1',
        'occurredAt': '2026-04-23T09:00:00Z',
        'senderName': 'Alex',
        'senderKey': 'alex@x.com',
        'preview': '#design-team',
        'subtitle': 'Alex: ping when free',
        'isUnread': false,
        'chat': {'conversationId': 'conv_1', 'kind': 'group'},
      });
      expect(item.source, UnifiedSource.chat);
      expect(item.conversationId, 'conv_1');
      expect(item.chatKind, 'group');
      expect(item.emailId, isNull);
    });
  });

  group('UnifiedInboxPage.fromJson', () {
    test('parses items, hasMore and cursor', () {
      final page = UnifiedInboxPage.fromJson({
        'items': [
          {
            'source': 'mail',
            'id': 'mail:1',
            'occurredAt': '2026-04-23T10:00:00Z',
            'senderName': 'A',
            'senderKey': 'a@x.com',
            'preview': 'p',
            'subtitle': 's',
            'isUnread': false,
          },
        ],
        'hasMore': true,
        'nextCursor': '2026-04-22T00:00:00Z',
      });
      expect(page.items, hasLength(1));
      expect(page.hasMore, isTrue);
      expect(page.nextCursor, isNotNull);
    });

    test('empty response yields no items', () {
      final page = UnifiedInboxPage.fromJson(const {});
      expect(page.items, isEmpty);
      expect(page.hasMore, isFalse);
    });
  });
}
