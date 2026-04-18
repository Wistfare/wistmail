import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:wistmail/features/mail/presentation/screens/inbox_screen.dart';

import '../../helpers/test_widget.dart';

void main() {
  testWidgets('shows empty state when inbox has no emails', (tester) async {
    final auth = FakeAuthRepository(sessionUser: sampleUser());
    final mail = FakeMailRepository(inbox: const []);
    final router = buildTestRouter(
      initialLocation: '/inbox',
      routes: {
        '/inbox': (c, s) => const InboxScreen(),
        '/auth/sign-in': (c, s) => const Scaffold(body: Text('SIGN_IN_PLACEHOLDER')),
        '/compose': (c, s) => const Scaffold(body: Text('COMPOSE_PLACEHOLDER')),
        '/email/:id': (c, s) => const Scaffold(body: Text('DETAIL_PLACEHOLDER')),
      },
    );

    await tester.pumpWidget(wrapWithProviders(
      child: const InboxScreen(),
      router: router,
      overrides: fakeProviderOverrides(auth: auth, mail: mail),
    ));
    await tester.pumpAndSettle();

    expect(find.text('Your inbox is empty'), findsOneWidget);
  });

  testWidgets('renders email rows from the repository', (tester) async {
    final auth = FakeAuthRepository(sessionUser: sampleUser());
    final mail = FakeMailRepository(
      inbox: [
        sampleEmail(id: 'e1', subject: 'Roadmap review', from: 'alex@x.com'),
        sampleEmail(id: 'e2', subject: 'Design tokens v2.4', from: 'sarah@x.com', isRead: true),
      ],
    );
    final router = buildTestRouter(
      initialLocation: '/inbox',
      routes: {
        '/inbox': (c, s) => const InboxScreen(),
        '/auth/sign-in': (c, s) => const Scaffold(body: Text('SIGN_IN_PLACEHOLDER')),
        '/compose': (c, s) => const Scaffold(body: Text('COMPOSE_PLACEHOLDER')),
        '/email/:id': (c, s) => Scaffold(body: Text('DETAIL ${s.pathParameters['id']}')),
      },
    );

    await tester.pumpWidget(wrapWithProviders(
      child: const InboxScreen(),
      router: router,
      overrides: fakeProviderOverrides(auth: auth, mail: mail),
    ));
    await tester.pumpAndSettle();

    expect(find.text('Roadmap review'), findsOneWidget);
    expect(find.text('Design tokens v2.4'), findsOneWidget);
    // Unread badge shows count of unread emails
    expect(find.text('1'), findsOneWidget);
  });

  testWidgets('tapping an email navigates to detail', (tester) async {
    final auth = FakeAuthRepository(sessionUser: sampleUser());
    final mail = FakeMailRepository(
      inbox: [sampleEmail(id: 'e1', subject: 'Tap me')],
    );
    final router = buildTestRouter(
      initialLocation: '/inbox',
      routes: {
        '/inbox': (c, s) => const InboxScreen(),
        '/auth/sign-in': (c, s) => const Scaffold(body: Text('SIGN_IN_PLACEHOLDER')),
        '/compose': (c, s) => const Scaffold(body: Text('COMPOSE_PLACEHOLDER')),
        '/email/:id': (c, s) => Scaffold(body: Text('DETAIL ${s.pathParameters['id']}')),
      },
    );

    await tester.pumpWidget(wrapWithProviders(
      child: const InboxScreen(),
      router: router,
      overrides: fakeProviderOverrides(auth: auth, mail: mail),
    ));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Tap me'));
    await tester.pumpAndSettle();

    expect(find.text('DETAIL e1'), findsOneWidget);
  });

  testWidgets('shows error state and retry when load fails', (tester) async {
    final auth = FakeAuthRepository(sessionUser: sampleUser());
    final mail = FakeMailRepository(listError: Exception('boom'));
    final router = buildTestRouter(
      initialLocation: '/inbox',
      routes: {
        '/inbox': (c, s) => const InboxScreen(),
        '/auth/sign-in': (c, s) => const Scaffold(body: Text('SIGN_IN_PLACEHOLDER')),
        '/compose': (c, s) => const Scaffold(body: Text('COMPOSE_PLACEHOLDER')),
        '/email/:id': (c, s) => const Scaffold(body: Text('DETAIL_PLACEHOLDER')),
      },
    );

    await tester.pumpWidget(wrapWithProviders(
      child: const InboxScreen(),
      router: router,
      overrides: fakeProviderOverrides(auth: auth, mail: mail),
    ));
    await tester.pumpAndSettle();

    expect(find.text('Try again'), findsOneWidget);
  });
}
