import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:wistmail/core/theme/app_theme.dart';
import 'package:wistmail/features/auth/data/auth_repository.dart';
import 'package:wistmail/features/auth/domain/mfa.dart';
import 'package:wistmail/features/auth/domain/user.dart';
import 'package:wistmail/features/auth/presentation/providers/auth_controller.dart';
import 'package:wistmail/features/mail/data/mail_repository.dart';
import 'package:wistmail/features/mail/domain/email.dart';
import 'package:wistmail/features/mail/presentation/providers/mail_providers.dart';

/// Minimal router used by widget tests — routes return the screen under test
/// so go_router navigation (push/go/pop) works without the full app graph.
GoRouter buildTestRouter({
  required String initialLocation,
  required Map<String, Widget Function(BuildContext, GoRouterState)> routes,
}) {
  return GoRouter(
    initialLocation: initialLocation,
    routes: [
      for (final entry in routes.entries)
        GoRoute(path: entry.key, builder: entry.value),
    ],
  );
}

Widget wrapWithProviders({
  required Widget child,
  required GoRouter router,
  List<Override> overrides = const [],
}) {
  return ProviderScope(
    overrides: overrides,
    child: MaterialApp.router(
      theme: AppTheme.dark,
      routerConfig: router,
      debugShowCheckedModeBanner: false,
    ),
  );
}

/// A fake AuthRepository that returns pre-set responses or throws.
class FakeAuthRepository implements AuthRepository {
  FakeAuthRepository({
    this.sessionUser,
    this.loginUser,
    this.loginError,
  });

  User? sessionUser;
  User? loginUser;
  Object? loginError;

  int loginCalls = 0;
  int logoutCalls = 0;

  @override
  Future<LoginResult> login({
    required String email,
    required String password,
  }) async {
    loginCalls++;
    if (loginError != null) throw loginError!;
    final user = loginUser ?? (throw StateError('no loginUser set'));
    return LoginCompleted(user);
  }

  @override
  Future<User> verifyLogin({
    required String pendingToken,
    required String code,
  }) async {
    if (loginError != null) throw loginError!;
    return loginUser ?? (throw StateError('no loginUser set'));
  }

  @override
  Future<void> requestLoginEmailCode(String pendingToken) async {}

  @override
  Future<User?> restoreSession() async => sessionUser;

  @override
  Future<void> logout() async {
    logoutCalls++;
  }

  @override
  Future<void> deleteAccount({required String password}) async {
    // Fake: no-op by default.
  }

  @override
  Future<MfaMethodsListing> listMfaMethods() async => const MfaMethodsListing(
        methods: [],
        backupTotal: 0,
        backupRemaining: 0,
      );

  @override
  Future<void> deleteMfaMethod(String methodId) async {}

  @override
  Future<TotpSetupChallenge> beginTotpSetup() async => const TotpSetupChallenge(
        methodId: 'mfa_test',
        secret: 'JBSWY3DPEHPK3PXP',
        otpauthUrl: 'otpauth://totp/test',
      );

  @override
  Future<MfaVerifySuccess> verifyTotpSetup({
    required String methodId,
    required String code,
  }) async =>
      const MfaVerifySuccess();

  @override
  Future<String> beginEmailSetup(String address) async => 'mfa_test';

  @override
  Future<MfaVerifySuccess> verifyEmailSetup({
    required String methodId,
    required String code,
  }) async =>
      const MfaVerifySuccess();

  @override
  Future<List<String>> regenerateBackupCodes() async => const [];
}

/// A fake MailRepository returning in-memory data.
class FakeMailRepository implements MailRepository {
  FakeMailRepository({
    List<Email>? inbox,
    List<Mailbox>? mailboxes,
    this.listError,
    this.composeError,
  })  : _inbox = inbox ?? const [],
        _mailboxes = mailboxes ?? const [];

  final List<Email> _inbox;
  final List<Mailbox> _mailboxes;
  Object? listError;
  Object? composeError;

  int composeCalls = 0;
  int markReadCalls = 0;
  int toggleStarCalls = 0;
  int archiveCalls = 0;
  int deleteCalls = 0;

  @override
  Future<EmailPage> listByFolder({
    String folder = 'inbox',
    int page = 1,
    int pageSize = 25,
  }) async {
    if (listError != null) throw listError!;
    return EmailPage(
      emails: _inbox,
      total: _inbox.length,
      page: page,
      pageSize: pageSize,
      hasMore: false,
    );
  }

  @override
  Future<Email> getById(String emailId) async {
    return _inbox.firstWhere((e) => e.id == emailId);
  }

  @override
  Future<void> markRead(String emailId) async {
    markReadCalls++;
  }

  @override
  Future<void> markUnread(String emailId) async {}

  @override
  Future<bool> toggleStar(String emailId) async {
    toggleStarCalls++;
    return true;
  }

  @override
  Future<void> archive(String emailId) async {
    archiveCalls++;
  }

  @override
  Future<void> delete(String emailId) async {
    deleteCalls++;
  }

  @override
  Future<Map<String, int>> getUnreadCounts() async =>
      const {'inbox': 0, 'drafts': 0, 'spam': 0, 'total': 0};

  @override
  Future<String> compose(ComposeDraft draft) async {
    composeCalls++;
    if (composeError != null) throw composeError!;
    return 'em_new';
  }

  @override
  Future<List<Mailbox>> getMailboxes() async => _mailboxes;

  @override
  Future<EmailPage> search(String query) async {
    final q = query.toLowerCase();
    final matches = _inbox
        .where((e) =>
            e.subject.toLowerCase().contains(q) ||
            e.fromAddress.toLowerCase().contains(q) ||
            (e.textBody ?? '').toLowerCase().contains(q))
        .toList();
    return EmailPage(
      emails: matches,
      total: matches.length,
      page: 1,
      pageSize: matches.length,
      hasMore: false,
    );
  }
}

User sampleUser({String id = 'u_1'}) => User(
      id: id,
      name: 'Vedadom',
      email: 'vedadom@wistfare.com',
      setupComplete: true,
    );

Email sampleEmail({
  String id = 'e1',
  String subject = 'Test subject',
  String body = 'Test body',
  bool isRead = false,
  bool isStarred = false,
  String from = 'alex.chen@wistfare.com',
}) {
  return Email.fromJson({
    'id': id,
    'fromAddress': from,
    'toAddresses': ['vedadom@wistfare.com'],
    'subject': subject,
    'textBody': body,
    'folder': 'inbox',
    'isRead': isRead,
    'isStarred': isStarred,
    'isDraft': false,
    'mailboxId': 'mbx_1',
    'createdAt': DateTime.now().toIso8601String(),
  });
}

List<Override> fakeProviderOverrides({
  required AuthRepository auth,
  required MailRepository mail,
}) {
  return [
    authRepositoryProvider.overrideWith((ref) async => auth),
    mailRepositoryProvider.overrideWith((ref) async => mail),
  ];
}

