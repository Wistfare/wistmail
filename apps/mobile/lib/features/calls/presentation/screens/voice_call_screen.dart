import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../../../core/theme/app_colors.dart';

/// Placeholder voice-call UI — matches the design, but calling is not yet
/// wired to any signaling infrastructure. See docs/ROADMAP-CALLS.md for the
/// WebRTC plan.
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
            // Subtle glow behind the avatar
            Positioned(
              top: 140,
              left: 0,
              right: 0,
              child: Center(
                child: Container(
                  width: 200,
                  height: 200,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: RadialGradient(
                      colors: [
                        AppColors.accent.withValues(alpha: 0.14),
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
                Container(
                  width: 96,
                  height: 96,
                  decoration: const BoxDecoration(
                    color: Color(0xFF1A3A5A),
                    shape: BoxShape.circle,
                  ),
                  child: Center(
                    child: Text(
                      _initialsFor(peerId),
                      style: GoogleFonts.inter(
                        fontSize: 32,
                        fontWeight: FontWeight.bold,
                        color: Colors.white,
                      ),
                    ),
                  ),
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
                const SizedBox(height: 8),
                Text(
                  'Calling…',
                  style: GoogleFonts.inter(
                    fontSize: 13,
                    color: AppColors.accent,
                  ),
                ),
                const Spacer(flex: 3),
                Padding(
                  padding: const EdgeInsets.fromLTRB(24, 0, 24, 32),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                    children: [
                      _ControlButton(icon: Icons.mic_off_outlined, onTap: () {}),
                      _ControlButton(icon: Icons.volume_up_outlined, onTap: () {}),
                      _ControlButton(
                        icon: Icons.call_end,
                        bg: AppColors.badgeRed,
                        iconColor: Colors.white,
                        onTap: () => context.pop(),
                      ),
                      _ControlButton(icon: Icons.more_horiz, onTap: () {}),
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

  String _initialsFor(String id) => id.isEmpty ? '?' : id.substring(0, 1).toUpperCase();
  String _nameFor(String id) => id.length < 4 ? 'Unknown' : 'Contact';
}

class _ControlButton extends StatelessWidget {
  const _ControlButton({
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
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        width: 56,
        height: 56,
        decoration: BoxDecoration(
          color: bg ?? AppColors.surface,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Icon(icon, color: iconColor ?? AppColors.textPrimary),
      ),
    );
  }
}
