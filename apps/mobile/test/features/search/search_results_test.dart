import 'package:flutter_test/flutter_test.dart';
import 'package:wistmail/features/search/domain/search_results.dart';

void main() {
  group('SearchResults.fromJson', () {
    test('parses a full response', () {
      final r = SearchResults.fromJson({
        'query': 'design review',
        'topMatch': {
          'id': 'em_1',
          'subject': 'Design review — tomorrow 10am',
          'fromName': 'Sarah Kim',
          'fromAddress': 'Sarah Kim <sarah@acme.co>',
          'snippet': 'can we shift the design review to 10am?',
          'createdAt': '2026-04-23T09:24:00Z',
        },
        'messages': [
          {
            'id': 'em_2',
            'subject': 'Re: Q2 design review prep',
            'fromName': 'Alex Chen',
            'fromAddress': 'alex@x.com',
            'snippet': 'Thanks for moving the design review',
            'isRead': false,
            'createdAt': '2026-04-12T10:00:00Z',
          },
        ],
        'people': [
          {
            'id': 'c_1',
            'name': 'Sarah Kim',
            'email': 'sarah@acme.co',
            'messageCount': 47,
          },
        ],
        'files': [
          {
            'id': 'att_1',
            'emailId': 'em_3',
            'filename': 'design-review-notes.pdf',
            'contentType': 'application/pdf',
            'sizeBytes': 2400000,
            'fromName': 'Sarah Kim',
            'createdAt': '2026-04-12T10:00:00Z',
          },
        ],
      });
      expect(r.query, 'design review');
      expect(r.topMatch, isNotNull);
      expect(r.topMatch!.fromName, 'Sarah Kim');
      expect(r.messages, hasLength(1));
      expect(r.messages.single.isRead, isFalse);
      expect(r.people.single.messageCount, 47);
      expect(r.files.single.sizeBytes, 2400000);
      expect(r.isEmpty, isFalse);
    });

    test('empty response is isEmpty', () {
      final r = SearchResults.fromJson({'query': 'nothing'});
      expect(r.isEmpty, isTrue);
      expect(r.messages, isEmpty);
      expect(r.people, isEmpty);
      expect(r.files, isEmpty);
      expect(r.topMatch, isNull);
    });

    test('tolerates missing optional fields on rows', () {
      final r = SearchResults.fromJson({
        'query': 'q',
        'messages': [
          {
            'id': 'em_x',
            // subject/fromName/snippet missing — defaults kick in
            'fromAddress': 'x@x.com',
            'createdAt': '2026-04-12T10:00:00Z',
          },
        ],
      });
      expect(r.messages.single.subject, '(no subject)');
      expect(r.messages.single.isRead, isTrue); // default
    });
  });
}
