import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../../core/widgets/wm_logo.dart';
import '../../../../core/widgets/wm_primary_button.dart';
import '../../../../core/widgets/wm_text_field.dart';
import '../providers/auth_controller.dart';

/// Mobile/SignIn — design.lib.pen node `fd0zF`.
class SignInScreen extends ConsumerStatefulWidget {
  const SignInScreen({super.key});

  @override
  ConsumerState<SignInScreen> createState() => _SignInScreenState();
}

class _SignInScreenState extends ConsumerState<SignInScreen> {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final email = _emailController.text.trim();
    final password = _passwordController.text;
    if (email.isEmpty || password.isEmpty) return;

    final success = await ref
        .read(authControllerProvider.notifier)
        .login(email: email, password: password);
    if (!mounted) return;
    if (success) {
      context.go('/inbox');
    } else {
      // Either MFA is now pending OR an error was set. The router's
      // redirect pins users with `awaitingMfa` to the challenge screen
      // automatically, but go there explicitly so test routers (which
      // don't include the redirect) follow the same flow.
      final state = ref.read(authControllerProvider);
      if (state.awaitingMfa) {
        context.go('/auth/mfa/challenge');
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authControllerProvider);

    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(24, 32, 24, 24),
          child: Column(
            children: [
              // Header occupies the top portion
              const Spacer(flex: 1),
              const _Header(),
              const Spacer(flex: 2),
              // Form + CTA pinned closer to the bottom
              _Form(
                emailController: _emailController,
                passwordController: _passwordController,
                isLoading: authState.isLoading,
                errorMessage: authState.errorMessage,
                onSubmit: _submit,
              ),
              const SizedBox(height: 20),
              Text(
                '© 2026 Wistfare Mail',
                style: AppTextStyles.caption
                    .copyWith(color: AppColors.textMuted, fontSize: 11),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header();

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        const WmLogo(size: 64),
        const SizedBox(height: 20),
        Text('Wistfare Mail', style: AppTextStyles.headlineMedium),
        const SizedBox(height: 8),
        Text(
          'Secure. Fast. Private.',
          style: GoogleFonts.jetBrainsMono(
            fontSize: 12,
            fontWeight: FontWeight.w600,
            color: AppColors.accent,
            letterSpacing: 0.4,
          ),
        ),
        const SizedBox(height: 12),
        Text(
          'Your professional email platform with end-to-\nend encryption and zero compromises.',
          textAlign: TextAlign.center,
          style: AppTextStyles.bodySmall.copyWith(height: 1.55),
        ),
      ],
    );
  }
}

class _Form extends StatelessWidget {
  const _Form({
    required this.emailController,
    required this.passwordController,
    required this.isLoading,
    required this.errorMessage,
    required this.onSubmit,
  });

  final TextEditingController emailController;
  final TextEditingController passwordController;
  final bool isLoading;
  final String? errorMessage;
  final Future<void> Function() onSubmit;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        WmTextField(
          key: const Key('email-field'),
          label: 'Email',
          controller: emailController,
          hint: 'you@wistfare.com',
          prefixIcon: Icons.mail_outline,
          keyboardType: TextInputType.emailAddress,
          autofillHints: const [AutofillHints.email],
        ),
        const SizedBox(height: 16),
        WmTextField(
          key: const Key('password-field'),
          label: 'Password',
          controller: passwordController,
          hint: '••••••••',
          prefixIcon: Icons.lock_outline,
          isPassword: true,
          autofillHints: const [AutofillHints.password],
          trailing: GestureDetector(
            onTap: () => context.push('/auth/forgot-password'),
            child: Text(
              'Forgot Password?',
              style: GoogleFonts.jetBrainsMono(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: AppColors.accent,
              ),
            ),
          ),
        ),
        if (errorMessage != null) ...[
          const SizedBox(height: 12),
          Text(
            errorMessage!,
            style: AppTextStyles.bodySmall.copyWith(color: AppColors.danger),
          ),
        ],
        const SizedBox(height: 24),
        WmPrimaryButton(
          key: const Key('sign-in-button'),
          label: 'Sign In',
          loading: isLoading,
          onPressed: onSubmit,
        ),
      ],
    );
  }
}
