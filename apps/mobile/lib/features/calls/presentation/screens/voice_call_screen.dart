import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/wm_avatar.dart';

/// Mobile/VoiceCall — design.lib.pen node `IxWmV`. Centered avatar with
/// soft accent glow, name, "Calling..." in lime, square control bar at
/// bottom (mic / speaker / end / more).
class VoiceCallScreen extends StatelessWidget {
  const VoiceCallScreen({super.key, required this.peerId});
  final String peerId;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: Stack(
          children: [
            Positioned(
              top: 200,
              left: 0,
              right: 0,
              child: Center(
                child: Container(
                  width: 220,
                  height: 220,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: RadialGradient(
                      colors: [
                        AppColors.accent.withValues(alpha: 0.18),
                        AppColors.accent.withValues(alpha: 0),
                      ],
                    ),
                  ),
                ),
              ),
            ),
            Column(
              children: [
                const Spacer(flex: 2),
                WmAvatar(
                  name: _nameFor(peerId),
                  size: 80,
                  color: AppColors.avatarBlue,
                ),
                const SizedBox(height: 20),
                Text(
                  _nameFor(peerId),
                  style: GoogleFonts.inter(
                    fontSize: 22,
                    fontWeight: FontWeight.w700,
                    color: AppColors.textPrimary,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  'Calling...',
                  style: GoogleFonts.jetBrainsMono(
                    fontSize: 12,
                    color: AppColors.accent,
                  ),
                ),
                const Spacer(flex: 3),
                Padding(
                  padding: const EdgeInsets.fromLTRB(40, 0, 40, 32),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                    children: [
                      _Btn(icon: Icons.mic_off_outlined, onTap: () {}),
                      _Btn(icon: Icons.volume_up_outlined, onTap: () {}),
                      _Btn(
                        icon: Icons.call_end,
                        bg: AppColors.danger,
                        iconColor: Colors.white,
                        onTap: () => context.pop(),
                      ),
                      _Btn(icon: Icons.more_horiz, onTap: () {}),
                    ],
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  String _nameFor(String id) => id.length < 4 ? 'Unknown' : 'Alex Chen';
}

class _Btn extends StatelessWidget {
  const _Btn({
    required this.icon,
    required this.onTap,
    this.bg,
    this.iconColor,
  });
  final IconData icon;
  final VoidCallback onTap;
  final Color? bg;
  final Color? iconColor;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: bg ?? AppColors.surface,
      child: InkWell(
        onTap: onTap,
        child: SizedBox(
          width: 48,
          height: 48,
          child: Icon(
            icon,
            color: iconColor ?? AppColors.textPrimary,
            size: 22,
          ),
        ),
      ),
    );
  }
}
