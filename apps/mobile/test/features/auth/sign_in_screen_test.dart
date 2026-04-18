import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:wistmail/core/network/api_exception.dart';
import 'package:wistmail/features/auth/presentation/screens/sign_in_screen.dart';

import '../../helpers/test_widget.dart';

void main() {
  testWidgets('renders branded sign-in form', (tester) async {
    final auth = FakeAuthRepository();
    final mail = FakeMailRepository();
    final router = buildTestRouter(
      initialLocation: '/auth/sign-in',
      routes: {
        '/auth/sign-in': (c, s) => const SignInScreen(),
        '/inbox': (c, s) => const Scaffold(body: Text('INBOX_PLACEHOLDER')),
      },
    );

    await tester.pumpWidget(wrapWithProviders(
      child: const SignInScreen(),
      router: router,
      overrides: fakeProviderOverrides(auth: auth, mail: mail),
    ));
    await tester.pumpAndSettle();

    expect(find.text('Wistfare Mail'), findsOneWidget);
    expect(find.text('Sign In'), findsOneWidget);
    expect(find.byKey(const Key('email-field')), findsOneWidget);
    expect(find.byKey(const Key('password-field')), findsOneWidget);
  });

  testWidgets('calls login on Sign In tap and navigates to /inbox', (tester) async {
    final auth = FakeAuthRepository(loginUser: sampleUser());
    final mail = FakeMailRepository();
    final router = buildTestRouter(
      initialLocation: '/auth/sign-in',
      routes: {
        '/auth/sign-in': (c, s) => const SignInScreen(),
        '/inbox': (c, s) => const Scaffold(body: Text('INBOX_PLACEHOLDER')),
      },
    );

    await tester.pumpWidget(wrapWithProviders(
      child: const SignInScreen(),
      router: router,
      overrides: fakeProviderOverrides(auth: auth, mail: mail),
    ));
    await tester.pumpAndSettle();

    await tester.enterText(find.byKey(const Key('email-field')), 'user@x.com');
    await tester.enterText(find.byKey(const Key('password-field')), 'secret');
    await tester.tap(find.byKey(const Key('sign-in-button')));
    await tester.pumpAndSettle();

    expect(auth.loginCalls, 1);
    expect(find.text('INBOX_PLACEHOLDER'), findsOneWidget);
  });

  testWidgets('shows error message when login fails', (tester) async {
    final auth = FakeAuthRepository(
      loginError: const ApiException(
        code: 'AUTH_ERROR',
        message: 'Invalid email or password',
        statusCode: 401,
      ),
    );
    final mail = FakeMailRepository();
    final router = buildTestRouter(
      initialLocation: '/auth/sign-in',
      routes: {
        '/auth/sign-in': (c, s) => const SignInScreen(),
        '/inbox': (c, s) => const Scaffold(body: Text('INBOX_PLACEHOLDER')),
      },
    );

    await tester.pumpWidget(wrapWithProviders(
      child: const SignInScreen(),
      router: router,
      overrides: fakeProviderOverrides(auth: auth, mail: mail),
    ));
    await tester.pumpAndSettle();

    await tester.enterText(find.byKey(const Key('email-field')), 'user@x.com');
    await tester.enterText(find.byKey(const Key('password-field')), 'wrong');
    await tester.tap(find.byKey(const Key('sign-in-button')));
    await tester.pumpAndSettle();

    expect(find.text('Invalid email or password'), findsOneWidget);
    expect(find.text('INBOX_PLACEHOLDER'), findsNothing);
  });
}
