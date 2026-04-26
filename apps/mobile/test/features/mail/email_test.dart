import 'package:flutter_test/flutter_test.dart';
import 'package:wistmail/features/mail/domain/email.dart';

Map<String, dynamic> _baseEmail({
  String id = 'e1',
  String from = 'alex.chen@wistfare.com',
  bool isRead = false,
  bool isStarred = false,
  String subject = 'Hello',
  String? text = 'Body',
}) => {
  'id': id,
  'fromAddress': from,
  'toAddresses': ['me@x.com'],
  'cc': [],
  'bcc': [],
  'subject': subject,
  'textBody': text,
  'folder': 'inbox',
  'isRead': isRead,
  'isStarred': isStarred,
  'isDraft': false,
  'mailboxId': 'mbx_1',
  'createdAt': DateTime.now().toIso8601String(),
};

void main() {
  group('Email.fromJson', () {
    test('parses minimum fields', () {
      final email = Email.fromJson(_baseEmail());
      expect(email.id, 'e1');
      expect(email.fromAddress, 'alex.chen@wistfare.com');
      expect(email.toAddresses, ['me@x.com']);
      expect(email.subject, 'Hello');
      expect(email.textBody, 'Body');
      expect(email.isRead, false);
      expect(email.folder, 'inbox');
    });

    test('tolerates null lists', () {
      final email = Email.fromJson({
        ..._baseEmail(),
        'toAddresses': null,
        'cc': null,
        'bcc': null,
      });
      expect(email.toAddresses, isEmpty);
      expect(email.cc, isEmpty);
      expect(email.bcc, isEmpty);
    });

    test('parses attachments when present', () {
      final email = Email.fromJson({
        ..._baseEmail(),
        'attachments': [
          {
            'id': 'a1',
            'filename': 'doc.pdf',
            'contentType': 'application/pdf',
            'sizeBytes': 1024,
            'contentId': 'inline-1',
          },
        ],
      });
      expect(email.attachments.length, 1);
      expect(email.attachments.first.filename, 'doc.pdf');
      expect(email.attachments.first.sizeBytes, 1024);
      expect(email.attachments.first.contentId, 'inline-1');
    });
  });

  group('Email senderName/senderInitials', () {
    test('uses local part when no display name', () {
      final email = Email.fromJson(_baseEmail(from: 'alex.chen@wistfare.com'));
      expect(email.senderName, 'alex.chen');
      expect(email.senderInitials, 'A');
    });

    test('parses display name from "Name <email>" format', () {
      final email = Email.fromJson(_baseEmail(from: 'Alex Chen <alex@x.com>'));
      expect(email.senderName, 'Alex Chen');
      expect(email.senderEmail, 'alex@x.com');
      expect(email.senderInitials, 'AC');
    });
  });

  group('Email.preview', () {
    test('collapses whitespace and truncates', () {
      final long = 'word ' * 50;
      final email = Email.fromJson(_baseEmail(text: long));
      expect(email.preview.length, lessThanOrEqualTo(141));
      expect(email.preview.contains('  '), false);
    });

    test('returns empty string when body is null', () {
      final email = Email.fromJson({..._baseEmail(), 'textBody': null});
      expect(email.preview, '');
    });
  });

  group('Email.copyWith', () {
    test('only updates specified fields', () {
      final email = Email.fromJson(_baseEmail(isRead: false, isStarred: false));
      final read = email.copyWith(isRead: true);
      expect(read.isRead, true);
      expect(read.isStarred, false);
      expect(read.subject, email.subject);
    });
  });

  group('EmailPage.fromJson', () {
    test('parses paginated response', () {
      final page = EmailPage.fromJson({
        'data': [_baseEmail(id: 'e1'), _baseEmail(id: 'e2')],
        'total': 2,
        'page': 1,
        'pageSize': 25,
        'hasMore': false,
      });
      expect(page.emails.length, 2);
      expect(page.total, 2);
      expect(page.hasMore, false);
    });

    test('handles empty data', () {
      final page = EmailPage.fromJson({
        'data': [],
        'total': 0,
        'page': 1,
        'pageSize': 25,
        'hasMore': false,
      });
      expect(page.emails, isEmpty);
    });
  });

  group('ComposeDraft.toJson', () {
    test('omits empty cc/bcc', () {
      final draft = ComposeDraft(
        fromAddress: 'me@x.com',
        mailboxId: 'mbx_1',
        toAddresses: ['you@x.com'],
        subject: 'Hey',
        textBody: 'Body',
      );
      final json = draft.toJson();
      expect(json.containsKey('cc'), false);
      expect(json.containsKey('bcc'), false);
      expect(json['toAddresses'], ['you@x.com']);
      expect(json['send'], true);
    });
  });

  group('Email.fromJson labels', () {
    test('parses inline labels array (auto-applied AI labels included)', () {
      // The list endpoint ships a flat `labels` array — AI-applied
      // and user-applied labels look identical to the row renderer,
      // which is the contract we want to lock in here.
      final email = Email.fromJson({
        ..._baseEmail(),
        'labels': [
          {'id': 'lbl_user', 'name': 'Work', 'color': '#FF0000'},
          {'id': 'lbl_ai', 'name': 'Urgent', 'color': '#FFCC00'},
        ],
      });
      expect(email.labels, hasLength(2));
      final names = email.labels.map((l) => l.name).toList()..sort();
      expect(names, ['Urgent', 'Work']);
    });

    test('defaults to an empty list when the field is missing', () {
      final email = Email.fromJson(_baseEmail());
      expect(email.labels, isEmpty);
    });
  });
}
