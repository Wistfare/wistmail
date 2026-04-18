import 'package:flutter_test/flutter_test.dart';
import 'package:wistmail/features/labels/data/labels_remote_data_source.dart';
import 'package:wistmail/features/labels/domain/label.dart';

import '../../helpers/fake_api_client.dart';

void main() {
  group('EmailLabel', () {
    test('parses and computes swatch', () {
      final l = EmailLabel.fromJson({
        'id': 'l1',
        'name': 'Urgent',
        'color': '#EF4444',
        'mailboxId': 'mbx_1',
      });
      expect(l.id, 'l1');
      expect(l.swatch.toARGB32().toRadixString(16), 'ffef4444');
    });

    test('tolerates invalid colour', () {
      final l = EmailLabel.fromJson({
        'id': 'l1',
        'name': 'Broken',
        'color': 'not-hex',
        'mailboxId': 'mbx_1',
      });
      expect(l.swatch, isNotNull);
    });
  });

  group('LabelsRemoteDataSource', () {
    test('listAll parses array', () async {
      final builder = FakeApiClientBuilder()
        ..on('GET', '/api/v1/labels', body: {
          'labels': [
            {'id': 'l1', 'name': 'Urgent', 'color': '#EF4444', 'mailboxId': 'mbx_1'},
            {'id': 'l2', 'name': 'Work', 'color': '#3B82F6', 'mailboxId': 'mbx_1'},
          ],
        });
      final ds = LabelsRemoteDataSource(builder.build());
      final labels = await ds.listAll();
      expect(labels.length, 2);
    });

    test('setForEmail PUTs labelIds', () async {
      final builder = FakeApiClientBuilder()
        ..on('PUT', '/api/v1/labels/email/e1', body: {'ok': true});
      final ds = LabelsRemoteDataSource(builder.build());
      await ds.setForEmail('e1', ['l1', 'l2']);
      final data = builder.capturedRequests.single.data as Map;
      expect(data['labelIds'], ['l1', 'l2']);
    });
  });
}
