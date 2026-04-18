import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:wistmail/features/mail/domain/email.dart';
import 'package:wistmail/features/mail/presentation/screens/compose_screen.dart';

import '../../helpers/test_widget.dart';

void main() {
  testWidgets('shows compose form with user\'s from address', (tester) async {
    final auth = FakeAuthRepository(sessionUser: sampleUser());
    final mail = FakeMailRepository(
      mailboxes: const [
        Mailbox(id: 'mbx_1', address: 'me@wistfare.com', displayName: 'Me'),
      ],
    );
    final router = buildTestRouter(
      initialLocation: '/compose',
      routes: {
        '/compose': (c, s) => const ComposeScreen(),
        '/inbox': (c, s) => const Scaffold(body: Text('INBOX_PLACEHOLDER')),
      },
    );

    await tester.pumpWidget(wrapWithProviders(
      child: const ComposeScreen(),
      router: router,
      overrides: fakeProviderOverrides(auth: auth, mail: mail),
    ));
    await tester.pumpAndSettle();

    expect(find.text('New Message'), findsOneWidget);
    expect(find.text('me@wistfare.com'), findsOneWidget);
    expect(find.text('Send'), findsOneWidget);
  });

  testWidgets('tapping Send calls repository.compose with entered values', (tester) async {
    final auth = FakeAuthRepository(sessionUser: sampleUser());
    final mail = FakeMailRepository(
      mailboxes: const [
        Mailbox(id: 'mbx_1', address: 'me@wistfare.com', displayName: 'Me'),
      ],
    );
    final router = buildTestRouter(
      initialLocation: '/compose',
      routes: {
        '/compose': (c, s) => const ComposeScreen(),
        '/inbox': (c, s) => const Scaffold(body: Text('INBOX_PLACEHOLDER')),
      },
    );

    await tester.pumpWidget(wrapWithProviders(
      child: const ComposeScreen(),
      router: router,
      overrides: fakeProviderOverrides(auth: auth, mail: mail),
    ));
    await tester.pumpAndSettle();

    await tester.enterText(find.widgetWithText(TextField, 'name@domain.com'), 'you@x.com');
    await tester.tap(find.text('Send'));
    await tester.pumpAndSettle();

    expect(mail.composeCalls, 1);
  });

  testWidgets('blocks Send when To is empty and shows an error', (tester) async {
    final auth = FakeAuthRepository(sessionUser: sampleUser());
    final mail = FakeMailRepository(
      mailboxes: const [
        Mailbox(id: 'mbx_1', address: 'me@wistfare.com', displayName: 'Me'),
      ],
    );
    final router = buildTestRouter(
      initialLocation: '/compose',
      routes: {
        '/compose': (c, s) => const ComposeScreen(),
        '/inbox': (c, s) => const Scaffold(body: Text('INBOX_PLACEHOLDER')),
      },
    );

    await tester.pumpWidget(wrapWithProviders(
      child: const ComposeScreen(),
      router: router,
      overrides: fakeProviderOverrides(auth: auth, mail: mail),
    ));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Send'));
    await tester.pumpAndSettle();

    expect(find.text('Add at least one recipient.'), findsOneWidget);
    expect(mail.composeCalls, 0);
  });
}
