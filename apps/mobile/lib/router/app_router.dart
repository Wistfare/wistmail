import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../features/auth/presentation/providers/auth_controller.dart';
import '../features/auth/presentation/screens/sign_in_screen.dart';
import '../features/auth/presentation/screens/forgot_password_screen.dart';
import '../features/auth/presentation/screens/reset_password_screen.dart';
import '../features/auth/presentation/screens/delete_account_screen.dart';
import '../features/mail/presentation/screens/inbox_screen_v3.dart';
import '../features/mail/presentation/screens/email_detail_screen.dart';
import '../features/mail/presentation/screens/thread_screen_v3.dart';
import '../features/mail/domain/compose_args.dart';
import '../features/mail/presentation/screens/compose_screen.dart';
import '../features/mail/presentation/screens/mail_search_screen.dart';
import '../features/search/presentation/screens/search_screen_v3.dart';
import '../features/chat/presentation/screens/chat_list_screen.dart';
import '../features/chat/presentation/screens/chat_conversation_screen.dart';
import '../features/chat/presentation/screens/chat_search_screen.dart';
import '../features/chat/presentation/screens/create_group_screen.dart';
import '../features/chat/presentation/screens/new_chat_screen.dart';
import '../features/labels/presentation/screens/label_assign_screen.dart';
import '../features/calendar/presentation/screens/calendar_screen_v3.dart';
import '../features/calendar/presentation/screens/create_event_screen.dart';
import '../features/calendar/presentation/screens/meet_screen.dart';
import '../features/calendar/presentation/screens/join_meeting_screen.dart';
import '../features/projects/presentation/screens/work_screen_v3.dart';
import '../features/today/presentation/screens/today_screen.dart';
import '../features/me/presentation/screens/me_screen.dart';
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
import '../features/settings/presentation/screens/labels_settings_screen.dart';
import '../features/settings/presentation/screens/settings_screen.dart';
import '../features/shell/presentation/screens/main_shell.dart';
import '../features/shell/presentation/screens/splash_screen.dart';

/// Root router. Built as a Riverpod provider so its `redirect` callback can
/// read the auth state directly.
///
/// Boot sequence:
///   1. App launches at `/` — renders [WmSplashScreen] (logo, no content).
///   2. `AuthController._restore()` runs async; `isRestoring` is true.
///   3. Any attempt to navigate to a protected route while restoring is
///      redirected back to `/`, so we never flash a half-loaded Today/
///      Inbox/etc. before we know whether the user is signed in.
///   4. When restore completes, the router re-evaluates and sends the
///      user to `/today` (authenticated) or `/auth/sign-in` (not).
final appRouterProvider = Provider<GoRouter>((ref) {
  final refresh = _AuthRefreshNotifier(ref);
  ref.onDispose(refresh.dispose);

  return GoRouter(
    initialLocation: '/',
    refreshListenable: refresh,
    redirect: (context, state) {
      final auth = ref.read(authControllerProvider);
      final loc = state.matchedLocation;
      final onAuthRoute = loc.startsWith('/auth/');
      final onSplash = loc == '/';

      // While the session is being restored we pin the user on the
      // splash. Without this the initial location would render a
      // protected screen for a beat before the auth state settled
      // and the redirect bounced us to /auth/sign-in.
      if (auth.isRestoring) {
        return onSplash ? null : '/';
      }

      // Restore is done — decide the real destination based on auth.
      final onMfaChallenge = loc == '/auth/mfa/challenge' ||
          loc == '/auth/mfa/backup-code';

      // Step 2 of login: a pending MFA challenge is in progress. Trap the
      // user on the challenge screens until they complete or cancel.
      if (auth.awaitingMfa) {
        return onMfaChallenge ? null : '/auth/mfa/challenge';
      }

      if (!auth.isAuthenticated) {
        // Already on a sign-in / reset screen? Let it render.
        return onAuthRoute ? null : '/auth/sign-in';
      }

      // Authenticated: kick the user off the splash or any /auth
      // screen into the primary shell.
      if (onSplash) return '/today';
      if (onAuthRoute && !loc.startsWith('/auth/mfa/')) {
        return '/today';
      }
      return null;
    },
    routes: [
      // Splash — root route. The `redirect` above pins the user here
      // while AuthController._restore() resolves.
      GoRoute(
        path: '/',
        builder: (context, state) => const WmSplashScreen(),
      ),
      // Auth — never wrapped in the shell
      GoRoute(
        path: '/auth/sign-in',
        builder: (context, state) => const SignInScreen(),
      ),
      GoRoute(
        path: '/auth/forgot-password',
        builder: (context, state) => const ForgotPasswordScreen(),
      ),
      GoRoute(
        path: '/auth/reset-password',
        // Accept ?token=… for deep links / App Links once provisioned.
        // Paste-token flow leaves it null.
        builder: (context, state) => ResetPasswordScreen(
          initialToken: state.uri.queryParameters['token'],
        ),
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

      // Main shell — four MobileV3 tabs as IndexedStack branches. Each
      // branch keeps its own state when the user switches tabs, so the
      // bottom nav and the tab body don't rebuild.
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) =>
            MainShell(navigationShell: navigationShell),
        branches: [
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/today',
                builder: (context, state) => const TodayScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/inbox',
                builder: (context, state) => const InboxScreenV3(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/calendar',
                builder: (context, state) => const CalendarScreenV3(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/projects',
                builder: (context, state) => const WorkScreenV3(),
              ),
            ],
          ),
        ],
      ),

      // Me screen — reachable from the Today header avatar. Full-screen
      // (no bottom nav) so it can surface logout + account management
      // without the shell underneath.
      GoRoute(
        path: '/me',
        builder: (context, state) => const MeScreen(),
      ),

      // Chat list — no longer a bottom-nav tab in MobileV3, but the
      // route is kept for the Inbox "Chats" filter + deep links.
      GoRoute(
        path: '/chat',
        builder: (context, state) => const ChatListScreen(),
      ),
      // Meet lives inside the Calendar tab conceptually; the route is
      // kept for deep links from notifications.
      GoRoute(
        path: '/meet',
        builder: (context, state) => const MeetScreen(),
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
        builder: (context, state) => const SearchScreenV3(),
      ),
      // Legacy mail-only search, kept for deep links that pre-date the
      // MobileV3 global search.
      GoRoute(
        path: '/search/mail',
        builder: (context, state) => const MailSearchScreen(),
      ),
      GoRoute(
        path: '/email/:id',
        builder: (context, state) =>
            ThreadScreenV3(emailId: state.pathParameters['id']!),
      ),
      // Legacy detail (retains snooze-action + sibling-thread UI) — kept
      // reachable for debugging and deep-links until every entry point
      // is migrated to the MobileV3 thread.
      GoRoute(
        path: '/email/:id/legacy',
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
        builder: (context, state) {
          // Reply / replyAll / forward pass a ComposeArgs via `extra`
          // so we can prefill the form without lossy URL encoding.
          final args = state.extra is ComposeArgs
              ? state.extra as ComposeArgs
              : ComposeArgs.empty;
          return ComposeScreen(args: args);
        },
      ),
      GoRoute(
        path: '/settings',
        builder: (context, state) => const SettingsScreen(),
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
        path: '/chat/new/group',
        builder: (context, state) => const CreateGroupScreen(),
      ),
      GoRoute(
        path: '/chat/search',
        builder: (context, state) => const ChatSearchScreen(),
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
      GoRoute(
        path: '/settings/labels',
        builder: (context, state) => const LabelsSettingsScreen(),
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
