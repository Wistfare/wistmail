import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../../core/widgets/wm_app_bar.dart';
import '../../../../core/widgets/wm_primary_button.dart';

/// Mobile/JoinMeeting — design.lib.pen node `CDfAx`. Centered glyph,
/// title + subtitle, code input, lime "Join Meeting", "or" divider,
/// outlined "Scan QR Code".
class JoinMeetingScreen extends StatefulWidget {
  const JoinMeetingScreen({super.key});

  @override
  State<JoinMeetingScreen> createState() => _JoinMeetingScreenState();
}

class _JoinMeetingScreenState extends State<JoinMeetingScreen> {
  final _codeController = TextEditingController();

  @override
  void dispose() {
    _codeController.dispose();
    super.dispose();
  }

  void _join() {
    final code = _codeController.text.trim();
    if (code.isEmpty) return;
    context.push('/call/video/$code');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: const WmAppBar(
        divider: false,
        showBack: false,
        leading: _CloseLeading(),
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 32),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                width: 64,
                height: 64,
                color: AppColors.accentDim,
                alignment: Alignment.center,
                child: const Icon(Icons.videocam_outlined,
                    color: AppColors.accent, size: 26),
              ),
              const SizedBox(height: 20),
              Text('Join a Meeting', style: AppTextStyles.headlineMedium),
              const SizedBox(height: 8),
              Text(
                'Enter the meeting code to join',
                style: AppTextStyles.bodySmall,
              ),
              const SizedBox(height: 32),
              Container(
                decoration: const BoxDecoration(
                  color: AppColors.surface,
                  border: Border.fromBorderSide(
                    BorderSide(color: AppColors.border, width: 1),
                  ),
                ),
                padding: const EdgeInsets.symmetric(horizontal: 14),
                child: TextField(
                  key: const Key('meeting-code'),
                  controller: _codeController,
                  textAlign: TextAlign.center,
                  cursorColor: AppColors.accent,
                  style: GoogleFonts.jetBrainsMono(
                    fontSize: 14,
                    color: AppColors.textPrimary,
                    letterSpacing: 1.2,
                  ),
                  decoration: InputDecoration(
                    hintText: '#  Enter meeting code...',
                    hintStyle: GoogleFonts.jetBrainsMono(
                      fontSize: 13,
                      color: AppColors.textTertiary,
                    ),
                    border: InputBorder.none,
                    isCollapsed: true,
                    contentPadding:
                        const EdgeInsets.symmetric(vertical: 16),
                  ),
                ),
              ),
              const SizedBox(height: 16),
              WmPrimaryButton(label: 'Join Meeting', onPressed: _join),
              const SizedBox(height: 16),
              Text('or', style: AppTextStyles.bodySmall),
              const SizedBox(height: 16),
              WmSecondaryButton(
                label: 'Scan QR Code',
                icon: Icons.qr_code_scanner,
                onPressed: () {},
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _CloseLeading extends StatelessWidget {
  const _CloseLeading();

  @override
  Widget build(BuildContext context) {
    return IconButton(
      splashRadius: 22,
      icon: const Icon(Icons.close, size: 22),
      color: AppColors.textPrimary,
      onPressed: () => Navigator.of(context).maybePop(),
    );
  }
}
