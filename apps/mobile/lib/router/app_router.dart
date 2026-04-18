import 'package:go_router/go_router.dart';
import '../features/auth/presentation/screens/sign_in_screen.dart';
import '../features/auth/presentation/screens/forgot_password_screen.dart';
import '../features/auth/presentation/screens/splash_screen.dart';
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

final appRouter = GoRouter(
  initialLocation: '/',
  routes: [
    GoRoute(path: '/', builder: (context, state) => const SplashScreen()),
    GoRoute(path: '/auth/sign-in', builder: (context, state) => const SignInScreen()),
    GoRoute(
      path: '/auth/forgot-password',
      builder: (context, state) => const ForgotPasswordScreen(),
    ),
    GoRoute(path: '/inbox', builder: (context, state) => const InboxScreen()),
    GoRoute(path: '/chat', builder: (context, state) => const ChatListScreen()),
    GoRoute(path: '/calendar', builder: (context, state) => const CalendarScreen()),
    GoRoute(
      path: '/calendar/new',
      builder: (context, state) => const CreateEventScreen(),
    ),
    GoRoute(path: '/meet', builder: (context, state) => const MeetScreen()),
    GoRoute(
      path: '/meet/new',
      builder: (context, state) => const CreateEventScreen(asMeeting: true),
    ),
    GoRoute(
      path: '/meet/join',
      builder: (context, state) => const JoinMeetingScreen(),
    ),
    GoRoute(path: '/projects', builder: (context, state) => const ProjectsScreen()),
    GoRoute(
      path: '/projects/new',
      builder: (context, state) => const CreateProjectScreen(),
    ),
    GoRoute(path: '/search', builder: (context, state) => const MailSearchScreen()),
    GoRoute(
      path: '/email/:id',
      builder: (context, state) => EmailDetailScreen(emailId: state.pathParameters['id']!),
    ),
    GoRoute(
      path: '/email/:id/labels',
      builder: (context, state) => LabelAssignScreen(emailId: state.pathParameters['id']!),
    ),
    GoRoute(path: '/compose', builder: (context, state) => const ComposeScreen()),
    GoRoute(path: '/chat/new', builder: (context, state) => const NewChatScreen()),
    GoRoute(
      path: '/conversation/:id',
      builder: (context, state) =>
          ChatConversationScreen(conversationId: state.pathParameters['id']!),
    ),
    GoRoute(
      path: '/call/voice/:peerId',
      builder: (context, state) => VoiceCallScreen(peerId: state.pathParameters['peerId']!),
    ),
    GoRoute(
      path: '/call/video/:meetingId',
      builder: (context, state) =>
          VideoCallScreen(meetingId: state.pathParameters['meetingId']!),
    ),
    GoRoute(
      path: '/settings/delete-account',
      builder: (context, state) => const DeleteAccountScreen(),
    ),
  ],
);
