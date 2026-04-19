import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../providers/calendar_providers.dart';

/// Mobile/CreateEvent — design.lib.pen node `wWm5D`. Mobile/CreateMeeting
/// is the same chrome with `R62yN` (asMeeting=true).
class CreateEventScreen extends ConsumerStatefulWidget {
  const CreateEventScreen({super.key, this.asMeeting = false});

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
        location: _locationController.text.trim().isEmpty
            ? null
            : _locationController.text.trim(),
        notes: _notesController.text.trim().isEmpty
            ? null
            : _notesController.text.trim(),
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
    final m = RegExp(r'ApiException\([^)]*\):\s*(.*)$').firstMatch(msg);
    return m != null ? m.group(1)! : 'Could not save.';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: Column(
          children: [
            _Header(
              title: widget.asMeeting ? 'New Meeting' : 'New Event',
              ctaLabel: widget.asMeeting ? 'Create' : 'Save',
              isSaving: _saving,
              onClose: () => context.pop(),
              onSave: _save,
            ),
            Expanded(
              child: ListView(
                padding: EdgeInsets.zero,
                children: [
                  _IconRow(
                    icon: Icons.text_fields,
                    child: TextField(
                      key: const Key('event-title'),
                      controller: _titleController,
                      cursorColor: AppColors.accent,
                      style: GoogleFonts.inter(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: AppColors.textPrimary,
                      ),
                      decoration: InputDecoration(
                        hintText: widget.asMeeting
                            ? 'Meeting title...'
                            : 'Event title...',
                        hintStyle: GoogleFonts.inter(
                          fontSize: 14,
                          color: AppColors.textTertiary,
                        ),
                        border: InputBorder.none,
                        isCollapsed: true,
                        contentPadding: EdgeInsets.zero,
                      ),
                    ),
                  ),
                  const Divider(color: AppColors.border, height: 1),
                  _IconRow(
                    icon: Icons.calendar_today_outlined,
                    child: GestureDetector(
                      onTap: () async {
                        final picked = await showDatePicker(
                          context: context,
                          initialDate: _startAt,
                          firstDate: DateTime.now()
                              .subtract(const Duration(days: 365)),
                          lastDate:
                              DateTime.now().add(const Duration(days: 365 * 3)),
                        );
                        if (picked != null) {
                          setState(() {
                            _startAt = DateTime(picked.year, picked.month,
                                picked.day, _startAt.hour, _startAt.minute);
                            _endAt = DateTime(picked.year, picked.month,
                                picked.day, _endAt.hour, _endAt.minute);
                          });
                        }
                      },
                      child: _readonly(
                        '${_weekday(_startAt.weekday)}, ${_short(_startAt.month)} ${_startAt.day}, ${_startAt.year}',
                      ),
                    ),
                  ),
                  const Divider(color: AppColors.border, height: 1),
                  _IconRow(
                    icon: Icons.schedule,
                    child: Row(
                      children: [
                        GestureDetector(
                          onTap: () => _pickTime(isStart: true),
                          child: _readonly(_fmtTime(_startAt)),
                        ),
                        const SizedBox(width: 8),
                        Text(' — ',
                            style: AppTextStyles.bodySmall
                                .copyWith(color: AppColors.textTertiary)),
                        const SizedBox(width: 8),
                        GestureDetector(
                          onTap: () => _pickTime(isStart: false),
                          child: _readonly(_fmtTime(_endAt)),
                        ),
                      ],
                    ),
                  ),
                  const Divider(color: AppColors.border, height: 1),
                  _IconRow(
                    icon: Icons.location_on_outlined,
                    child: TextField(
                      controller: _locationController,
                      cursorColor: AppColors.accent,
                      style: GoogleFonts.inter(
                        fontSize: 14,
                        color: AppColors.textPrimary,
                      ),
                      decoration: InputDecoration(
                        hintText: 'Add location',
                        hintStyle: GoogleFonts.inter(
                          fontSize: 14,
                          color: AppColors.textTertiary,
                        ),
                        border: InputBorder.none,
                        isCollapsed: true,
                        contentPadding: EdgeInsets.zero,
                      ),
                    ),
                  ),
                  const Divider(color: AppColors.border, height: 1),
                  _IconRow(
                    icon: Icons.people_outline,
                    child: Text(
                      'Add participants...',
                      style: GoogleFonts.inter(
                        fontSize: 14,
                        color: AppColors.textTertiary,
                      ),
                    ),
                  ),
                  const Divider(color: AppColors.border, height: 1),
                  _IconRow(
                    icon: Icons.repeat,
                    child: Text(
                      'Does not repeat',
                      style: GoogleFonts.inter(
                        fontSize: 14,
                        color: AppColors.textPrimary,
                      ),
                    ),
                  ),
                  const Divider(color: AppColors.border, height: 1),
                  _ToggleRow(
                    icon: Icons.link,
                    iconColor: AppColors.accent,
                    label: 'Generate Meet link automatically',
                    labelColor: AppColors.accent,
                    value: _generateMeetingLink,
                    onChanged: (v) => setState(() => _generateMeetingLink = v),
                  ),
                  const Divider(color: AppColors.border, height: 1),
                  if (_generateMeetingLink) ...[
                    _ToggleRow(
                      icon: Icons.meeting_room_outlined,
                      iconColor: AppColors.textSecondary,
                      label: 'Waiting room',
                      labelColor: AppColors.textPrimary,
                      value: _hasWaitingRoom,
                      onChanged: (v) => setState(() => _hasWaitingRoom = v),
                    ),
                    const Divider(color: AppColors.border, height: 1),
                  ],
                  _IconRow(
                    icon: Icons.notifications_outlined,
                    child: DropdownButton<int>(
                      value: _reminderMinutes,
                      isDense: true,
                      isExpanded: true,
                      dropdownColor: AppColors.surface,
                      underline: const SizedBox.shrink(),
                      iconEnabledColor: AppColors.textTertiary,
                      style: GoogleFonts.inter(
                        fontSize: 14,
                        color: AppColors.textPrimary,
                      ),
                      items: const [0, 5, 15, 30, 60]
                          .map((m) => DropdownMenuItem(
                                value: m,
                                child: Text('$m min before'),
                              ))
                          .toList(),
                      onChanged: (v) =>
                          setState(() => _reminderMinutes = v ?? 15),
                    ),
                  ),
                  const Divider(color: AppColors.border, height: 1),
                  _IconRow(
                    icon: Icons.notes_outlined,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    child: TextField(
                      controller: _notesController,
                      maxLines: 4,
                      cursorColor: AppColors.accent,
                      style: GoogleFonts.inter(
                        fontSize: 14,
                        color: AppColors.textPrimary,
                      ),
                      decoration: InputDecoration(
                        hintText: 'Notes',
                        hintStyle: GoogleFonts.inter(
                          fontSize: 14,
                          color: AppColors.textTertiary,
                        ),
                        border: InputBorder.none,
                        isCollapsed: true,
                        contentPadding: EdgeInsets.zero,
                      ),
                    ),
                  ),
                  const Divider(color: AppColors.border, height: 1),
                  _IconRow(
                    icon: Icons.color_lens_outlined,
                    child: Row(
                      children: [
                        Expanded(
                          child: Text(
                            'Color',
                            style: GoogleFonts.inter(
                              fontSize: 14,
                              color: AppColors.textTertiary,
                            ),
                          ),
                        ),
                        Container(
                            width: 16, height: 16, color: AppColors.accent),
                      ],
                    ),
                  ),
                  if (_error != null) ...[
                    const SizedBox(height: 12),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 20),
                      child: Text(
                        _error!,
                        style: AppTextStyles.bodySmall
                            .copyWith(color: AppColors.danger),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _pickTime({required bool isStart}) async {
    final initial = isStart
        ? TimeOfDay.fromDateTime(_startAt)
        : TimeOfDay.fromDateTime(_endAt);
    final picked = await showTimePicker(context: context, initialTime: initial);
    if (picked == null) return;
    setState(() {
      if (isStart) {
        _startAt = DateTime(_startAt.year, _startAt.month, _startAt.day,
            picked.hour, picked.minute);
        if (_endAt.isBefore(_startAt)) {
          _endAt = _startAt.add(const Duration(hours: 1));
        }
      } else {
        _endAt = DateTime(_endAt.year, _endAt.month, _endAt.day,
            picked.hour, picked.minute);
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
  String _short(int m) => const [
        '',
        'Jan',
        'Feb',
        'Mar',
        'Apr',
        'May',
        'Jun',
        'Jul',
        'Aug',
        'Sep',
        'Oct',
        'Nov',
        'Dec'
      ][m];
}

class _Header extends StatelessWidget {
  const _Header({
    required this.title,
    required this.ctaLabel,
    required this.isSaving,
    required this.onClose,
    required this.onSave,
  });
  final String title;
  final String ctaLabel;
  final bool isSaving;
  final VoidCallback onClose;
  final VoidCallback onSave;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 56,
      padding: const EdgeInsets.symmetric(horizontal: 8),
      child: Row(
        children: [
          IconButton(
            splashRadius: 22,
            icon: const Icon(Icons.close, size: 22),
            color: AppColors.textPrimary,
            onPressed: onClose,
          ),
          Expanded(
            child: Center(
              child: Text(title, style: AppTextStyles.titleMedium),
            ),
          ),
          Material(
            color: AppColors.accent,
            child: InkWell(
              onTap: isSaving ? null : onSave,
              child: Padding(
                padding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                child: Text(
                  isSaving ? 'Saving…' : ctaLabel,
                  style: GoogleFonts.inter(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: AppColors.background,
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(width: 8),
        ],
      ),
    );
  }
}

class _IconRow extends StatelessWidget {
  const _IconRow({
    required this.icon,
    required this.child,
    this.crossAxisAlignment = CrossAxisAlignment.center,
  });
  final IconData icon;
  final Widget child;
  final CrossAxisAlignment crossAxisAlignment;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
      child: Row(
        crossAxisAlignment: crossAxisAlignment,
        children: [
          Icon(icon, size: 18, color: AppColors.textTertiary),
          const SizedBox(width: 16),
          Expanded(child: child),
        ],
      ),
    );
  }
}

class _ToggleRow extends StatelessWidget {
  const _ToggleRow({
    required this.icon,
    required this.iconColor,
    required this.label,
    required this.labelColor,
    required this.value,
    required this.onChanged,
  });
  final IconData icon;
  final Color iconColor;
  final String label;
  final Color labelColor;
  final bool value;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
      child: Row(
        children: [
          Icon(icon, size: 18, color: iconColor),
          const SizedBox(width: 16),
          Expanded(
            child: Text(
              label,
              style: GoogleFonts.inter(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: labelColor,
              ),
            ),
          ),
          // Sharp toggle: 40x22 box, lime fill when on
          GestureDetector(
            onTap: () => onChanged(!value),
            child: Container(
              width: 40,
              height: 22,
              padding: const EdgeInsets.all(2),
              color: value ? AppColors.accent : AppColors.surface,
              alignment:
                  value ? Alignment.centerRight : Alignment.centerLeft,
              child: Container(
                width: 16,
                height: 18,
                color: value ? AppColors.background : AppColors.textTertiary,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
