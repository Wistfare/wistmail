import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/wm_primary_button.dart';
import '../providers/auth_controller.dart';

class SignInScreen extends ConsumerStatefulWidget {
  const SignInScreen({super.key});

  @override
  ConsumerState<SignInScreen> createState() => _SignInScreenState();
}

class _SignInScreenState extends ConsumerState<SignInScreen> {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _obscure = true;

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
    }
  }

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authControllerProvider);

    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              const SizedBox(height: 48),
              const _LogoSection(),
              const SizedBox(height: 48),
              _FormSection(
                emailController: _emailController,
                passwordController: _passwordController,
                obscure: _obscure,
                onToggleObscure: () => setState(() => _obscure = !_obscure),
                isLoading: authState.isLoading,
                errorMessage: authState.errorMessage,
                onSubmit: _submit,
              ),
              const SizedBox(height: 40),
              const _Footer(),
              const SizedBox(height: 24),
            ],
          ),
        ),
      ),
    );
  }
}

class _LogoSection extends StatelessWidget {
  const _LogoSection();

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Stack(
          alignment: Alignment.center,
          children: [
            Container(
              width: 80,
              height: 80,
              decoration: BoxDecoration(
                color: AppColors.accent.withValues(alpha: 0.08),
                shape: BoxShape.circle,
              ),
            ),
            Container(
              width: 56,
              height: 56,
              decoration: BoxDecoration(
                color: AppColors.accent,
                borderRadius: BorderRadius.circular(14),
              ),
              child: Center(
                child: Text(
                  'W',
                  style: GoogleFonts.inter(
                    fontSize: 28,
                    fontWeight: FontWeight.bold,
                    color: AppColors.background,
                  ),
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 20),
        Text(
          'Wistfare Mail',
          style: GoogleFonts.inter(
            fontSize: 24,
            fontWeight: FontWeight.bold,
            color: AppColors.textPrimary,
          ),
        ),
        const SizedBox(height: 6),
        Text(
          'Secure. Fast. Private.',
          style: GoogleFonts.inter(
            fontSize: 14,
            fontWeight: FontWeight.w600,
            color: AppColors.accent,
          ),
        ),
        const SizedBox(height: 8),
        Text(
          'Your professional email platform with end-to-\nend encryption and zero compromises.',
          textAlign: TextAlign.center,
          style: GoogleFonts.inter(
            fontSize: 13,
            color: AppColors.textSecondary,
            height: 1.5,
          ),
        ),
      ],
    );
  }
}

class _FormSection extends StatelessWidget {
  const _FormSection({
    required this.emailController,
    required this.passwordController,
    required this.obscure,
    required this.onToggleObscure,
    required this.isLoading,
    required this.errorMessage,
    required this.onSubmit,
  });

  final TextEditingController emailController;
  final TextEditingController passwordController;
  final bool obscure;
  final VoidCallback onToggleObscure;
  final bool isLoading;
  final String? errorMessage;
  final Future<void> Function() onSubmit;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _FieldLabel('EMAIL'),
        const SizedBox(height: 6),
        TextField(
          key: const Key('email-field'),
          controller: emailController,
          keyboardType: TextInputType.emailAddress,
          autocorrect: false,
          style: GoogleFonts.inter(fontSize: 14, color: AppColors.textPrimary),
          decoration: const InputDecoration(
            hintText: 'you@wistfare.com',
            prefixIcon: Icon(Icons.mail_outline, size: 18, color: AppColors.textTertiary),
          ),
        ),
        const SizedBox(height: 16),
        _FieldLabel('PASSWORD'),
        const SizedBox(height: 6),
        TextField(
          key: const Key('password-field'),
          controller: passwordController,
          obscureText: obscure,
          autocorrect: false,
          style: GoogleFonts.inter(fontSize: 14, color: AppColors.textPrimary),
          decoration: InputDecoration(
            hintText: '••••••••',
            prefixIcon: const Icon(Icons.lock_outline, size: 18, color: AppColors.textTertiary),
            suffixIcon: IconButton(
              icon: Icon(
                obscure ? Icons.visibility_off_outlined : Icons.visibility_outlined,
                size: 18,
                color: AppColors.textTertiary,
              ),
              onPressed: onToggleObscure,
            ),
          ),
        ),
        if (errorMessage != null) ...[
          const SizedBox(height: 12),
          Text(
            errorMessage!,
            style: GoogleFonts.inter(
              fontSize: 13,
              color: AppColors.badgeRed,
            ),
          ),
        ],
        const SizedBox(height: 12),
        Align(
          alignment: Alignment.centerRight,
          child: GestureDetector(
            onTap: () => context.push('/auth/forgot-password'),
            child: Text(
              'Forgot Password?',
              style: GoogleFonts.inter(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: AppColors.accent,
              ),
            ),
          ),
        ),
        const SizedBox(height: 24),
        WmPrimaryButton(
          key: const Key('sign-in-button'),
          label: isLoading ? 'Signing in…' : 'Sign In',
          onPressed: isLoading ? null : onSubmit,
        ),
      ],
    );
  }
}

class _FieldLabel extends StatelessWidget {
  const _FieldLabel(this.text);
  final String text;
  @override
  Widget build(BuildContext context) => Text(
        text,
        style: GoogleFonts.inter(
          fontSize: 11,
          fontWeight: FontWeight.w600,
          color: AppColors.textSecondary,
          letterSpacing: 0.8,
        ),
      );
}

class _Footer extends StatelessWidget {
  const _Footer();
  @override
  Widget build(BuildContext context) {
    return Text(
      '© 2024 Wistfare Mail',
      style: GoogleFonts.inter(fontSize: 12, color: AppColors.textTertiary),
    );
  }
}
