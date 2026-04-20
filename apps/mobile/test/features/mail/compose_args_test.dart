import 'package:flutter_test/flutter_test.dart';
import 'package:wistmail/features/mail/domain/compose_args.dart';
import 'package:wistmail/features/mail/domain/email.dart';

Email build({
  String from = 'Alex Johnson <alex@acme.com>',
  List<String> to = const ['me@x.com'],
  List<String> cc = const [],
  String subject = 'Q1 Roadmap',
  String body = 'Hello team,\nLet\'s align.',
}) {
  return Email(
    id: 'eml_1',
    fromAddress: from,
    toAddresses: to,
    cc: cc,
    subject: subject,
    textBody: body,
    folder: 'inbox',
    isRead: true,
    isStarred: false,
    isDraft: false,
    createdAt: DateTime.utc(2026, 4, 24, 10, 30),
  );
}

void main() {
  group('ComposeFromEmail.reply', () {
    test('targets the original sender only', () {
      final args = ComposeFromEmail.reply(build());
      expect(args.toAddresses, ['alex@acme.com']);
      expect(args.cc, isEmpty);
    });

    test('prefixes subject with "Re:" idempotently', () {
      expect(ComposeFromEmail.reply(build(subject: 'Hello')).subject, 'Re: Hello');
      expect(
        ComposeFromEmail.reply(build(subject: 'Re: Hello')).subject,
        'Re: Hello',
        reason: 'must not double-prefix',
      );
      expect(
        ComposeFromEmail.reply(build(subject: 'RE: Hello')).subject,
        'RE: Hello',
        reason: 'case-insensitive idempotency',
      );
    });

    test('quotes the original body with > prefix and a header line', () {
      final args = ComposeFromEmail.reply(build());
      expect(args.body, contains('Alex Johnson <alex@acme.com> wrote'));
      expect(args.body, contains('> Hello team,'));
      expect(args.body, contains("> Let's align."));
    });

    test('carries inReplyTo from the source id', () {
      final args = ComposeFromEmail.reply(build());
      expect(args.inReplyTo, 'eml_1');
    });
  });

  group('ComposeFromEmail.replyAll', () {
    test('aggregates from + to + cc, dedups, removes the user', () {
      final email = build(
        from: 'Alex <alex@acme.com>',
        to: ['me@x.com', 'sam@x.com'],
        cc: ['lee@x.com', 'sam@x.com'],
      );
      final args = ComposeFromEmail.replyAll(email, userEmail: 'me@x.com');
      expect(args.toAddresses, ['alex@acme.com']);
      // cc has sam + lee; me@x.com excluded; dedup of sam.
      expect(args.cc.toSet(), {'sam@x.com', 'lee@x.com'});
      expect(args.cc, isNot(contains('me@x.com')));
    });

    test('ignores casing when filtering self', () {
      final email = build(to: ['ME@x.com'], cc: const []);
      final args = ComposeFromEmail.replyAll(email, userEmail: 'me@x.com');
      expect(args.cc, isNot(contains('ME@x.com')));
    });
  });

  group('ComposeFromEmail.forward', () {
    test('empty recipients, "Fwd:" subject, full quoted block', () {
      final args = ComposeFromEmail.forward(build());
      expect(args.toAddresses, isEmpty);
      expect(args.subject, 'Fwd: Q1 Roadmap');
      expect(args.body, contains('---------- Forwarded message ----------'));
      expect(args.body, contains('From: Alex Johnson <alex@acme.com>'));
      expect(args.body, contains('Subject: Q1 Roadmap'));
    });

    test('idempotent Fwd: prefix', () {
      expect(
        ComposeFromEmail.forward(build(subject: 'Fwd: Already')).subject,
        'Fwd: Already',
      );
    });

    test('handles missing subject gracefully', () {
      expect(ComposeFromEmail.forward(build(subject: '')).subject, 'Fwd: (no subject)');
    });
  });
}
