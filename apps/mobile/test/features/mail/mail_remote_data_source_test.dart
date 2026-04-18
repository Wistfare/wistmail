import 'package:flutter_test/flutter_test.dart';
import 'package:wistmail/features/mail/data/mail_remote_data_source.dart';
import 'package:wistmail/features/mail/domain/email.dart';

import '../../helpers/fake_api_client.dart';

Map<String, dynamic> _email(String id) => {
      'id': id,
      'fromAddress': 'a@x.com',
      'toAddresses': ['me@x.com'],
      'subject': 's$id',
      'textBody': 'body',
      'folder': 'inbox',
      'isRead': false,
      'isStarred': false,
      'isDraft': false,
      'mailboxId': 'mbx_1',
      'createdAt': DateTime.now().toIso8601String(),
    };

void main() {
  group('MailRemoteDataSource.listByFolder', () {
    test('sends folder/page/pageSize query and parses page', () async {
      final builder = FakeApiClientBuilder()
        ..on('GET', '/api/v1/inbox/emails', body: {
          'data': [_email('1'), _email('2')],
          'total': 2,
          'page': 1,
          'pageSize': 25,
          'hasMore': false,
        });

      final ds = MailRemoteDataSource(builder.build());
      final page = await ds.listByFolder(folder: 'inbox');

      expect(page.emails.length, 2);
      final req = builder.capturedRequests.single;
      expect(req.queryParameters['folder'], 'inbox');
      expect(req.queryParameters['page'], 1);
      expect(req.queryParameters['pageSize'], 25);
    });
  });

  group('MailRemoteDataSource.getById', () {
    test('returns email', () async {
      final builder = FakeApiClientBuilder()
        ..on('GET', '/api/v1/inbox/emails/e1', body: _email('e1'));

      final ds = MailRemoteDataSource(builder.build());
      final email = await ds.getById('e1');
      expect(email.id, 'e1');
    });
  });

  group('MailRemoteDataSource.toggleStar', () {
    test('returns starred boolean', () async {
      final builder = FakeApiClientBuilder()
        ..on('POST', '/api/v1/inbox/emails/e1/star', body: {'starred': true});

      final ds = MailRemoteDataSource(builder.build());
      final starred = await ds.toggleStar('e1');
      expect(starred, true);
    });
  });

  group('MailRemoteDataSource.markRead/archive/delete', () {
    test('markRead hits right route', () async {
      final builder = FakeApiClientBuilder()
        ..on('POST', '/api/v1/inbox/emails/e1/read', body: {'ok': true});
      await MailRemoteDataSource(builder.build()).markRead('e1');
      expect(builder.capturedRequests.single.path, '/api/v1/inbox/emails/e1/read');
    });

    test('archive hits right route', () async {
      final builder = FakeApiClientBuilder()
        ..on('POST', '/api/v1/inbox/emails/e1/archive', body: {'ok': true});
      await MailRemoteDataSource(builder.build()).archive('e1');
      expect(builder.capturedRequests.single.path, '/api/v1/inbox/emails/e1/archive');
    });

    test('delete hits right route', () async {
      final builder = FakeApiClientBuilder()
        ..on('POST', '/api/v1/inbox/emails/e1/delete', body: {'ok': true});
      await MailRemoteDataSource(builder.build()).delete('e1');
      expect(builder.capturedRequests.single.path, '/api/v1/inbox/emails/e1/delete');
    });
  });

  group('MailRemoteDataSource.compose', () {
    test('sends draft JSON and returns id', () async {
      final builder = FakeApiClientBuilder()
        ..on('POST', '/api/v1/inbox/compose', status: 201, body: {
          'id': 'em_new',
          'status': 'sending',
        });

      final ds = MailRemoteDataSource(builder.build());
      final id = await ds.compose(
        ComposeDraft(
          fromAddress: 'me@x.com',
          mailboxId: 'mbx_1',
          toAddresses: ['you@x.com'],
          subject: 'Hey',
          textBody: 'Hello',
        ),
      );
      expect(id, 'em_new');
      final data = builder.capturedRequests.single.data as Map;
      expect(data['fromAddress'], 'me@x.com');
      expect(data['mailboxId'], 'mbx_1');
      expect(data['toAddresses'], ['you@x.com']);
      expect(data['send'], true);
    });
  });

  group('MailRemoteDataSource.getMailboxes', () {
    test('returns list of mailboxes', () async {
      final builder = FakeApiClientBuilder()
        ..on('GET', '/api/v1/user/mailboxes', body: {
          'mailboxes': [
            {'id': 'mbx_1', 'address': 'me@x.com', 'displayName': 'Me', 'domainId': 'd1'},
          ]
        });

      final ds = MailRemoteDataSource(builder.build());
      final list = await ds.getMailboxes();
      expect(list.length, 1);
      expect(list.first.address, 'me@x.com');
    });
  });
}
