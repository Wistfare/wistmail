import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../../../core/theme/app_colors.dart';

/// Placeholder video-call UI — no real WebRTC yet. See docs/ROADMAP-CALLS.md.
class VideoCallScreen extends StatelessWidget {
  const VideoCallScreen({super.key, required this.meetingId});
  final String meetingId;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 8),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Sprint Planning',
                          style: GoogleFonts.inter(
                            fontSize: 16,
                            fontWeight: FontWeight.w600,
                            color: AppColors.textPrimary,
                          ),
                        ),
                        Text(
                          '12:34',
                          style: GoogleFonts.inter(fontSize: 12, color: AppColors.accent),
                        ),
                      ],
                    ),
                  ),
                  const Icon(Icons.people_outline, color: AppColors.textSecondary, size: 18),
                  const SizedBox(width: 4),
                  Text(
                    '5',
                    style: GoogleFonts.inter(fontSize: 13, color: AppColors.textSecondary),
                  ),
                ],
              ),
            ),
            Expanded(
              child: GridView.count(
                padding: const EdgeInsets.all(8),
                crossAxisCount: 2,
                mainAxisSpacing: 8,
                crossAxisSpacing: 8,
                children: const [
                  _Tile(name: 'Alex Chen', color: Color(0xFF1C2E14)),
                  _Tile(name: 'Sarah Miller', color: Color(0xFF1E1A2E)),
                  _Tile(name: 'Jordan Park', color: Color(0xFF2E1A1A)),
                  _Tile(name: 'You', color: Color(0xFF142E24), isYou: true),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  _Ctrl(icon: Icons.mic_off_outlined, onTap: () {}),
                  _Ctrl(icon: Icons.videocam_outlined, onTap: () {}),
                  _Ctrl(icon: Icons.screen_share_outlined, onTap: () {}),
                  _Ctrl(icon: Icons.chat_bubble_outline, onTap: () {}),
                  _Ctrl(
                    icon: Icons.call_end,
                    bg: AppColors.badgeRed,
                    iconColor: Colors.white,
                    onTap: () => context.pop(),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Tile extends StatelessWidget {
  const _Tile({required this.name, required this.color, this.isYou = false});
  final String name;
  final Color color;
  final bool isYou;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(10),
        border: isYou ? Border.all(color: AppColors.accent, width: 2) : null,
      ),
      alignment: Alignment.bottomLeft,
      padding: const EdgeInsets.all(8),
      child: isYou
          ? Column(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Center(
                  child: Container(
                    width: 48,
                    height: 48,
                    decoration: BoxDecoration(
                      color: AppColors.accent,
                      borderRadius: BorderRadius.circular(24),
                    ),
                    alignment: Alignment.center,
                    child: Text(
                      'V',
                      style: GoogleFonts.inter(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                        color: AppColors.background,
                      ),
                    ),
                  ),
                ),
                Text(name, style: _label()),
              ],
            )
          : Text(name, style: _label()),
    );
  }

  TextStyle _label() => GoogleFonts.inter(
        fontSize: 12,
        color: AppColors.textPrimary,
      );
}

class _Ctrl extends StatelessWidget {
  const _Ctrl({required this.icon, required this.onTap, this.bg, this.iconColor});
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
        width: 48,
        height: 48,
        decoration: BoxDecoration(
          color: bg ?? AppColors.surface,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Icon(icon, color: iconColor ?? AppColors.textPrimary, size: 20),
      ),
    );
  }
}
