import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../features/auth/presentation/providers/auth_controller.dart';
import '../features/auth/presentation/screens/sign_in_screen.dart';
import '../features/auth/presentation/screens/forgot_password_screen.dart';
import '../features/auth/presentation/screens/delete_account_screen.dart';
import '../features/mail/presentation/screens/inbox_screen.dart';
import '../features/mail/presentation/screens/email_detail_screen.dart';
import '../features/mail/presentation/screens/compose_screen.dart';
import '../features/mail/presentation/screens/mail_search_screen.dart';
import '../features/chat/presentation/screens/chat_list_screen.dart';
import '../features/chat/presentation/screens/chat_conversation_screen.dart';
import '../features/chat/presentation/screens/new_chat_screen.dart';
import '../features/labels/presentation/screens/label_assign_screen.dart';
import '../features/calendar/presentation/screens/calendar_screen.dart';
import '../features/calendar/presentation/screens/create_event_screen.dart';
import '../features/calendar/presentation/screens/meet_screen.dart';
import '../features/calendar/presentation/screens/join_meeting_screen.dart';
import '../features/projects/presentation/screens/projects_screen.dart';
import '../features/projects/presentation/screens/create_project_screen.dart';
import '../features/calls/presentation/screens/voice_call_screen.dart';
import '../features/calls/presentation/screens/video_call_screen.dart';
import '../features/mfa/presentation/screens/mfa_challenge_screen.dart';
import '../features/mfa/presentation/screens/mfa_backup_code_screen.dart';
import '../features/mfa/presentation/screens/mfa_setup_chooser_screen.dart';
import '../features/mfa/presentation/screens/mfa_totp_setup_screen.dart';
import '../features/mfa/presentation/screens/mfa_email_setup_screen.dart';
import '../features/mfa/presentation/screens/mfa_backup_codes_screen.dart';
import '../features/mfa/presentation/screens/mfa_methods_settings_screen.dart';
import '../features/settings/presentation/screens/pending_sync_screen.dart';
import '../features/shell/presentation/screens/main_shell.dart';

/// Root router. Built as a Riverpod provider so its `redirect` callback can
/// read the auth state directly. There is no splash screen — the app boots
/// into `/inbox`, which renders its own skeleton while the auth controller
/// restores the saved session in the background. Once the restore completes,
/// the router redirects to `/auth/sign-in` if the user is not authenticated;
/// otherwise the inbox stays put and shows the real list as soon as the
/// data arrives.
final appRouterProvider = Provider<GoRouter>((ref) {
  final refresh = _AuthRefreshNotifier(ref);
  ref.onDispose(refresh.dispose);

  return GoRouter(
    initialLocation: '/inbox',
    refreshListenable: refresh,
    redirect: (context, state) {
      final auth = ref.read(authControllerProvider);
      if (auth.isRestoring) return null;

      final loc = state.matchedLocation;
      final onAuthRoute = loc.startsWith('/auth/');
      final onMfaChallenge = loc == '/auth/mfa/challenge' ||
          loc == '/auth/mfa/backup-code';

      // Step 2 of login: a pending MFA challenge is in progress. Trap the
      // user on the challenge screens until they complete or cancel.
      if (auth.awaitingMfa) {
        return onMfaChallenge ? null : '/auth/mfa/challenge';
      }

      if (!auth.isAuthenticated && !onAuthRoute) {
        return '/auth/sign-in';
      }
      // After login, the MFA enrollment routes are valid auth-protected
      // pages — don't bounce them back to the inbox.
      if (auth.isAuthenticated &&
          onAuthRoute &&
          !loc.startsWith('/auth/mfa/')) {
        return '/inbox';
      }
      return null;
    },
    routes: [
      // Auth — never wrapped in the shell
      GoRoute(
        path: '/auth/sign-in',
        builder: (context, state) => const SignInScreen(),
      ),
      GoRoute(
        path: '/auth/forgot-password',
        builder: (context, state) => const ForgotPasswordScreen(),
      ),

      // MFA login challenge (after step 1 password). The router redirect
      // pins users here while `awaitingMfa` is true.
      GoRoute(
        path: '/auth/mfa/challenge',
        builder: (context, state) => const MfaChallengeScreen(),
      ),
      GoRoute(
        path: '/auth/mfa/backup-code',
        builder: (context, state) => const MfaBackupCodeScreen(),
      ),

      // MFA enrollment (post-login). Reachable from the inbox banner or
      // the settings screen.
      GoRoute(
        path: '/auth/mfa/setup',
        builder: (context, state) => const MfaSetupChooserScreen(),
      ),
      GoRoute(
        path: '/auth/mfa/setup/totp',
        builder: (context, state) => const MfaTotpSetupScreen(),
      ),
      GoRoute(
        path: '/auth/mfa/setup/email',
        builder: (context, state) => const MfaEmailSetupScreen(),
      ),
      GoRoute(
        path: '/auth/mfa/setup/backup-codes',
        builder: (context, state) {
          final codes = (state.extra as List<String>?) ?? const <String>[];
          return MfaBackupCodesScreen(codes: codes);
        },
      ),
      GoRoute(
        path: '/auth/mfa/methods',
        builder: (context, state) => const MfaMethodsSettingsScreen(),
      ),

      // Main shell — five tabs as IndexedStack branches. Each branch keeps
      // its own state when the user switches tabs, so the bottom nav and
      // the tab body don't rebuild.
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) =>
            MainShell(navigationShell: navigationShell),
        branches: [
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/inbox',
                builder: (context, state) => const InboxScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/chat',
                builder: (context, state) => const ChatListScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/calendar',
                builder: (context, state) => const CalendarScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/meet',
                builder: (context, state) => const MeetScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/projects',
                builder: (context, state) => const ProjectsScreen(),
              ),
            ],
          ),
        ],
      ),

      // Full-screen routes (no shell / no bottom nav)
      GoRoute(
        path: '/calendar/new',
        builder: (context, state) => const CreateEventScreen(),
      ),
      GoRoute(
        path: '/meet/new',
        builder: (context, state) => const CreateEventScreen(asMeeting: true),
      ),
      GoRoute(
        path: '/meet/join',
        builder: (context, state) => const JoinMeetingScreen(),
      ),
      GoRoute(
        path: '/projects/new',
        builder: (context, state) => const CreateProjectScreen(),
      ),
      GoRoute(
        path: '/search',
        builder: (context, state) => const MailSearchScreen(),
      ),
      GoRoute(
        path: '/email/:id',
        builder: (context, state) =>
            EmailDetailScreen(emailId: state.pathParameters['id']!),
      ),
      GoRoute(
        path: '/email/:id/labels',
        builder: (context, state) =>
            LabelAssignScreen(emailId: state.pathParameters['id']!),
      ),
      GoRoute(
        path: '/compose',
        builder: (context, state) => const ComposeScreen(),
      ),
      GoRoute(
        path: '/settings/pending-sync',
        builder: (context, state) => const PendingSyncScreen(),
      ),
      GoRoute(
        path: '/chat/new',
        builder: (context, state) => const NewChatScreen(),
      ),
      GoRoute(
        path: '/conversation/:id',
        builder: (context, state) => ChatConversationScreen(
          conversationId: state.pathParameters['id']!,
        ),
      ),
      GoRoute(
        path: '/call/voice/:peerId',
        builder: (context, state) =>
            VoiceCallScreen(peerId: state.pathParameters['peerId']!),
      ),
      GoRoute(
        path: '/call/video/:meetingId',
        builder: (context, state) => VideoCallScreen(
          meetingId: state.pathParameters['meetingId']!,
        ),
      ),
      GoRoute(
        path: '/settings/delete-account',
        builder: (context, state) => const DeleteAccountScreen(),
      ),
    ],
  );
});

/// Listens to the auth state and pings the router so its `redirect` runs
/// again whenever auth changes (login, logout, restore-complete, etc).
class _AuthRefreshNotifier extends ChangeNotifier {
  _AuthRefreshNotifier(Ref ref) {
    _sub = ref.listen<AuthState>(
      authControllerProvider,
      (_, __) => notifyListeners(),
      fireImmediately: false,
    );
  }

  late final ProviderSubscription<AuthState> _sub;

  @override
  void dispose() {
    _sub.close();
    super.dispose();
  }
}
