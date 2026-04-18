import 'package:flutter_test/flutter_test.dart';
import 'package:wistmail/features/mail/data/mail_remote_data_source.dart';

import '../../helpers/fake_api_client.dart';

Map<String, dynamic> _email(String id, String subject) => {
      'id': id,
      'fromAddress': 'a@x.com',
      'toAddresses': ['me@x.com'],
      'subject': subject,
      'textBody': 'body for $id',
      'folder': 'inbox',
      'isRead': false,
      'isStarred': false,
      'isDraft': false,
      'mailboxId': 'mbx_1',
      'createdAt': DateTime.now().toIso8601String(),
    };

void main() {
  group('MailRemoteDataSource.search', () {
    test('calls /inbox/search with q and returns page', () async {
      final builder = FakeApiClientBuilder()
        ..on('GET', '/api/v1/inbox/search', body: {
          'data': [_email('1', 'Product roadmap'), _email('2', 'Product launch')],
          'total': 2,
          'page': 1,
          'pageSize': 2,
          'hasMore': false,
        });

      final ds = MailRemoteDataSource(builder.build());
      final page = await ds.search('product');
      expect(page.emails.length, 2);
      final req = builder.capturedRequests.single;
      expect(req.path, '/api/v1/inbox/search');
      expect(req.queryParameters['q'], 'product');
    });
  });
}
