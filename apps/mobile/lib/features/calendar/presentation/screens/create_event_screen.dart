import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../../../core/theme/app_colors.dart';
import '../providers/calendar_providers.dart';

class CreateEventScreen extends ConsumerStatefulWidget {
  const CreateEventScreen({super.key, this.asMeeting = false});

  /// When true, defaults to including a meeting link (New Meeting).
  final bool asMeeting;

  @override
  ConsumerState<CreateEventScreen> createState() => _CreateEventScreenState();
}

class _CreateEventScreenState extends ConsumerState<CreateEventScreen> {
  final _titleController = TextEditingController();
  final _locationController = TextEditingController();
  final _notesController = TextEditingController();
  DateTime _startAt = DateTime.now().add(const Duration(hours: 1));
  DateTime _endAt = DateTime.now().add(const Duration(hours: 2));
  bool _generateMeetingLink = false;
  bool _hasWaitingRoom = false;
  int _reminderMinutes = 15;
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    if (widget.asMeeting) _generateMeetingLink = true;
  }

  @override
  void dispose() {
    _titleController.dispose();
    _locationController.dispose();
    _notesController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final title = _titleController.text.trim();
    if (title.isEmpty) {
      setState(() => _error = 'Title is required');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final repo = await ref.read(calendarRepositoryProvider.future);
      await repo.createEvent(
        title: title,
        startAt: _startAt,
        endAt: _endAt,
        location: _locationController.text.trim().isEmpty ? null : _locationController.text.trim(),
        notes: _notesController.text.trim().isEmpty ? null : _notesController.text.trim(),
        meetingLink: _generateMeetingLink ? 'generate' : null,
        hasWaitingRoom: _hasWaitingRoom,
        reminderMinutes: [_reminderMinutes],
      );
      ref.invalidate(upcomingEventsProvider);
      ref.invalidate(upcomingMeetingsProvider);
      if (!mounted) return;
      context.pop();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _error = _format(e);
      });
    }
  }

  String _format(Object error) {
    final msg = error.toString();
    final match = RegExp(r'ApiException\([^)]*\):\s*(.*)$').firstMatch(msg);
    return match != null ? match.group(1)! : 'Could not save.';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.background,
        leading: IconButton(
          icon: const Icon(Icons.close, color: AppColors.textPrimary),
          onPressed: () => context.pop(),
        ),
        title: Text(
          widget.asMeeting ? 'New Meeting' : 'New Event',
          style: GoogleFonts.inter(
            fontSize: 18,
            fontWeight: FontWeight.w600,
            color: AppColors.textPrimary,
          ),
        ),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 12),
            child: ElevatedButton(
              onPressed: _saving ? null : _save,
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.accent,
                foregroundColor: AppColors.background,
                elevation: 0,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
              ),
              child: Text(
                _saving ? 'Saving…' : (widget.asMeeting ? 'Create' : 'Save'),
                style: GoogleFonts.inter(fontSize: 14, fontWeight: FontWeight.w600),
              ),
            ),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
        children: [
          _Row(
            icon: Icons.title,
            child: TextField(
              key: const Key('event-title'),
              controller: _titleController,
              style: GoogleFonts.inter(fontSize: 16, color: AppColors.textPrimary),
              decoration: InputDecoration(
                hintText: widget.asMeeting ? 'Meeting title…' : 'Event title…',
                hintStyle: GoogleFonts.inter(color: AppColors.textTertiary, fontSize: 16),
                border: InputBorder.none,
                enabledBorder: InputBorder.none,
                focusedBorder: InputBorder.none,
                filled: false,
                isDense: true,
                contentPadding: EdgeInsets.zero,
              ),
            ),
          ),
          const Divider(color: AppColors.border, height: 1),
          _Row(
            icon: Icons.calendar_today_outlined,
            child: GestureDetector(
              onTap: () async {
                final picked = await showDatePicker(
                  context: context,
                  initialDate: _startAt,
                  firstDate: DateTime.now().subtract(const Duration(days: 365)),
                  lastDate: DateTime.now().add(const Duration(days: 365 * 3)),
                );
                if (picked != null) {
                  setState(() {
                    _startAt = DateTime(picked.year, picked.month, picked.day, _startAt.hour, _startAt.minute);
                    _endAt = DateTime(picked.year, picked.month, picked.day, _endAt.hour, _endAt.minute);
                  });
                }
              },
              child: _readonly('${_weekday(_startAt.weekday)}, ${_short(_startAt.month)} ${_startAt.day}, ${_startAt.year}'),
            ),
          ),
          const Divider(color: AppColors.border, height: 1),
          _Row(
            icon: Icons.schedule,
            child: Row(
              children: [
                Expanded(
                  child: GestureDetector(
                    onTap: () => _pickTime(isStart: true),
                    child: _readonly(_fmtTime(_startAt)),
                  ),
                ),
                Text(' — ', style: GoogleFonts.inter(color: AppColors.textSecondary)),
                Expanded(
                  child: GestureDetector(
                    onTap: () => _pickTime(isStart: false),
                    child: _readonly(_fmtTime(_endAt)),
                  ),
                ),
              ],
            ),
          ),
          const Divider(color: AppColors.border, height: 1),
          _Row(
            icon: Icons.location_on_outlined,
            child: TextField(
              controller: _locationController,
              style: GoogleFonts.inter(fontSize: 14, color: AppColors.textPrimary),
              decoration: InputDecoration(
                hintText: 'Location or meeting room',
                hintStyle: GoogleFonts.inter(color: AppColors.textTertiary, fontSize: 14),
                border: InputBorder.none,
                enabledBorder: InputBorder.none,
                focusedBorder: InputBorder.none,
                filled: false,
                isDense: true,
                contentPadding: EdgeInsets.zero,
              ),
            ),
          ),
          const Divider(color: AppColors.border, height: 1),
          SwitchListTile(
            contentPadding: const EdgeInsets.symmetric(horizontal: 0),
            secondary: const Icon(Icons.videocam_outlined, color: AppColors.accent),
            title: Text(
              'Generate Wistfare Meet link',
              style: GoogleFonts.inter(fontSize: 14, color: AppColors.accent, fontWeight: FontWeight.w600),
            ),
            activeThumbColor: AppColors.accent,
            value: _generateMeetingLink,
            onChanged: (v) => setState(() => _generateMeetingLink = v),
          ),
          if (_generateMeetingLink)
            SwitchListTile(
              contentPadding: const EdgeInsets.symmetric(horizontal: 0),
              secondary: const Icon(Icons.meeting_room_outlined, color: AppColors.textSecondary),
              title: Text(
                'Waiting room',
                style: GoogleFonts.inter(fontSize: 14, color: AppColors.textPrimary),
              ),
              activeThumbColor: AppColors.accent,
              value: _hasWaitingRoom,
              onChanged: (v) => setState(() => _hasWaitingRoom = v),
            ),
          const Divider(color: AppColors.border, height: 1),
          _Row(
            icon: Icons.notifications_outlined,
            child: DropdownButton<int>(
              value: _reminderMinutes,
              dropdownColor: AppColors.surface,
              underline: const SizedBox.shrink(),
              style: GoogleFonts.inter(fontSize: 14, color: AppColors.textPrimary),
              items: const [0, 5, 15, 30, 60]
                  .map((m) => DropdownMenuItem(
                        value: m,
                        child: Text('$m min before'),
                      ))
                  .toList(),
              onChanged: (v) => setState(() => _reminderMinutes = v ?? 15),
            ),
          ),
          const Divider(color: AppColors.border, height: 1),
          _Row(
            icon: Icons.notes_outlined,
            child: TextField(
              controller: _notesController,
              maxLines: 4,
              style: GoogleFonts.inter(fontSize: 14, color: AppColors.textPrimary),
              decoration: InputDecoration(
                hintText: 'Notes',
                hintStyle: GoogleFonts.inter(color: AppColors.textTertiary, fontSize: 14),
                border: InputBorder.none,
                enabledBorder: InputBorder.none,
                focusedBorder: InputBorder.none,
                filled: false,
                contentPadding: EdgeInsets.zero,
              ),
            ),
          ),
          if (_error != null) ...[
            const SizedBox(height: 12),
            Text(
              _error!,
              style: GoogleFonts.inter(fontSize: 13, color: AppColors.badgeRed),
            ),
          ],
        ],
      ),
    );
  }

  Future<void> _pickTime({required bool isStart}) async {
    final initial = isStart ? TimeOfDay.fromDateTime(_startAt) : TimeOfDay.fromDateTime(_endAt);
    final picked = await showTimePicker(context: context, initialTime: initial);
    if (picked == null) return;
    setState(() {
      if (isStart) {
        _startAt = DateTime(_startAt.year, _startAt.month, _startAt.day, picked.hour, picked.minute);
        if (_endAt.isBefore(_startAt)) {
          _endAt = _startAt.add(const Duration(hours: 1));
        }
      } else {
        _endAt = DateTime(_endAt.year, _endAt.month, _endAt.day, picked.hour, picked.minute);
      }
    });
  }

  Widget _readonly(String value) => Text(
        value,
        style: GoogleFonts.inter(fontSize: 14, color: AppColors.textPrimary),
      );

  String _fmtTime(DateTime d) {
    final h = d.hour == 0 ? 12 : (d.hour > 12 ? d.hour - 12 : d.hour);
    final m = d.minute.toString().padLeft(2, '0');
    final ampm = d.hour >= 12 ? 'PM' : 'AM';
    return '$h:$m $ampm';
  }

  String _weekday(int w) =>
      const ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][w];
  String _short(int m) =>
      const ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m];
}

class _Row extends StatelessWidget {
  const _Row({required this.icon, required this.child});
  final IconData icon;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Row(
        children: [
          Icon(icon, size: 18, color: AppColors.textSecondary),
          const SizedBox(width: 16),
          Expanded(child: child),
        ],
      ),
    );
  }
}
