import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/wm_avatar.dart';

/// Mobile/VideoCall — design.lib.pen node `Ze4AQ`. Sharp 2x2 tiles with
/// subtle distinct hues per participant, "You" tile carries an accent
/// outline + central lime avatar.
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
                          style: GoogleFonts.jetBrainsMono(
                            fontSize: 12,
                            color: AppColors.accent,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const Icon(Icons.people_outline,
                      color: AppColors.textSecondary, size: 18),
                  const SizedBox(width: 6),
                  Text(
                    '5',
                    style: GoogleFonts.jetBrainsMono(
                      fontSize: 13,
                      color: AppColors.textSecondary,
                    ),
                  ),
                ],
              ),
            ),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.all(8),
                child: GridView.count(
                  crossAxisCount: 2,
                  mainAxisSpacing: 4,
                  crossAxisSpacing: 4,
                  children: const [
                    _Tile(name: 'Alex Chen', tint: Color(0xFF1E2614)),
                    _Tile(name: 'Sarah Miller', tint: Color(0xFF1A1626)),
                    _Tile(name: 'Jordan Park', tint: Color(0xFF26161A)),
                    _Tile(
                      name: 'You',
                      tint: Color(0xFF152620),
                      isYou: true,
                      youInitial: 'V',
                    ),
                  ],
                ),
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
                    bg: AppColors.danger,
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
  const _Tile({
    required this.name,
    required this.tint,
    this.isYou = false,
    this.youInitial = '?',
  });
  final String name;
  final Color tint;
  final bool isYou;
  final String youInitial;

  @override
  Widget build(BuildContext context) {
    return Container(
      color: tint,
      padding: const EdgeInsets.all(10),
      child: Stack(
        children: [
          if (isYou)
            Center(
              child: WmAvatar(
                name: youInitial,
                size: 56,
                color: AppColors.accent,
              ),
            ),
          Align(
            alignment: Alignment.bottomLeft,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                if (isYou)
                  const Padding(
                    padding: EdgeInsets.only(bottom: 2),
                    child: Text(''),
                  ),
                Text(
                  name,
                  style: GoogleFonts.inter(
                    fontSize: 12,
                    fontWeight: FontWeight.w500,
                    color: AppColors.textPrimary,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Ctrl extends StatelessWidget {
  const _Ctrl({
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
