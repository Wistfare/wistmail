import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../../../core/theme/app_colors.dart';
import '../providers/calendar_providers.dart';

/// MobileV3 CreateEvent — matches `design.lib.pen` node `uRlkp`.
///
/// Layout:
///   iTop (padding [8,20]): back btn 40×40 wm-surface circle + title
///     "NEW EVENT"/"NEW MEETING" 11/700 letterSpacing 1.5 + "SAVE" pill
///     (cornerRadius 14, padding [8,12], fill accent, text "SAVE" 10/700
///     letterSpacing 1 black).
///   iBody (padding [16,20,0,20], gap 18 between sections):
///     DETAILS card: TITLE row + WHERE row (map-pin trailing).
///     WHEN card: STARTS + ENDS (trailing "Nh" accent pill computed from delta).
///     VIDEO & PEOPLE card: VIDEO + WITH (with attendee count pill).
///   ctaWrap: "+ CREATE EVENT" 54h cornerRadius 27 accent button.
class CreateEventScreen extends ConsumerStatefulWidget {
  const CreateEventScreen({super.key, this.asMeeting = false});

  final bool asMeeting;

  @override
  ConsumerState<CreateEventScreen> createState() => _CreateEventScreenState();
}

class _CreateEventScreenState extends ConsumerState<CreateEventScreen> {
  final _titleController = TextEditingController();
  final _locationController = TextEditingController();
  final _attendeesController = TextEditingController();
  DateTime _startAt = DateTime.now().add(const Duration(hours: 1));
  DateTime _endAt = DateTime.now().add(const Duration(hours: 2));
  bool _generateMeetingLink = false;
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
    _attendeesController.dispose();
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
      final attendees = _attendeesController.text
          .split(RegExp(r'[,;]\s*'))
          .where((s) => s.trim().isNotEmpty)
          .toList();
      await repo.createEvent(
        title: title,
        startAt: _startAt,
        endAt: _endAt,
        location: _locationController.text.trim().isEmpty
            ? null
            : _locationController.text.trim(),
        attendees: attendees,
        meetingLink: _generateMeetingLink ? 'generate' : null,
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

  Future<void> _pickStart() async {
    final picked = await _pickDateTime(context, _startAt);
    if (picked == null) return;
    setState(() {
      _startAt = picked;
      if (_endAt.isBefore(_startAt)) {
        _endAt = _startAt.add(const Duration(hours: 1));
      }
    });
  }

  Future<void> _pickEnd() async {
    final picked = await _pickDateTime(context, _endAt);
    if (picked == null) return;
    if (picked.isBefore(_startAt)) {
      setState(() => _error = 'Ends must be after Starts');
      return;
    }
    setState(() => _endAt = picked);
  }

  @override
  Widget build(BuildContext context) {
    final duration = _endAt.difference(_startAt);
    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: Column(
          children: [
            _Header(
              title: widget.asMeeting ? 'NEW MEETING' : 'NEW EVENT',
              onBack: () => context.pop(),
              onSave: _saving ? null : _save,
            ),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
                children: [
                  _Section(
                    eyebrow: 'DETAILS',
                    children: [
                      _InputRow(
                        label: 'TITLE',
                        controller: _titleController,
                        placeholder: 'Design review — Q2 roadmap',
                      ),
                      const _Divider(),
                      _InputRow(
                        label: 'WHERE',
                        controller: _locationController,
                        placeholder: 'Conference Room B',
                        trailing: const Icon(LucideIcons.mapPin,
                            size: 14, color: AppColors.textSecondary),
                      ),
                    ],
                  ),
                  const SizedBox(height: 18),
                  _Section(
                    eyebrow: 'WHEN',
                    children: [
                      _DateRow(
                        label: 'STARTS',
                        value: _fmt(_startAt),
                        onTap: _pickStart,
                      ),
                      const _Divider(),
                      _DateRow(
                        label: 'ENDS',
                        value: _fmt(_endAt),
                        onTap: _pickEnd,
                        trailing: _AccentPill(label: _durationLabel(duration)),
                      ),
                    ],
                  ),
                  const SizedBox(height: 18),
                  _Section(
                    eyebrow: 'VIDEO & PEOPLE',
                    children: [
                      _ToggleRow(
                        label: 'VIDEO',
                        value: _generateMeetingLink
                            ? 'WistMeet — auto-link'
                            : 'None',
                        onTap: () => setState(() =>
                            _generateMeetingLink = !_generateMeetingLink),
                        trailing: _generateMeetingLink
                            ? const _AccentPill(label: 'ON')
                            : null,
                      ),
                      const _Divider(),
                      _InputRow(
                        label: 'WITH',
                        controller: _attendeesController,
                        placeholder: 'email@, email@, …',
                        trailing: _attendeeCountPill(),
                      ),
                    ],
                  ),
                  if (_error != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 14),
                      child: Text(
                        _error!,
                        style: GoogleFonts.jetBrainsMono(
                          color: AppColors.danger,
                          fontSize: 12,
                        ),
                      ),
                    ),
                  const SizedBox(height: 24),
                ],
              ),
            ),
            _CtaButton(
              icon: widget.asMeeting ? LucideIcons.video : LucideIcons.plus,
              label: widget.asMeeting ? 'CREATE MEETING' : 'CREATE EVENT',
              loading: _saving,
              onTap: _saving ? null : _save,
            ),
          ],
        ),
      ),
    );
  }

  Widget? _attendeeCountPill() {
    final n = _attendeesController.text
        .split(RegExp(r'[,;]\s*'))
        .where((s) => s.trim().isNotEmpty)
        .length;
    if (n == 0) return null;
    return _AccentPill(label: '$n');
  }

  static String _fmt(DateTime dt) {
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
    ];
    final h = dt.hour.toString().padLeft(2, '0');
    final m = dt.minute.toString().padLeft(2, '0');
    return '${months[dt.month - 1]} ${dt.day} · $h:$m';
  }

  static String _durationLabel(Duration d) {
    final minutes = d.inMinutes;
    if (minutes < 60) return '${minutes}M';
    final hours = minutes ~/ 60;
    final rem = minutes % 60;
    return rem == 0 ? '${hours}H' : '${hours}H${rem}M';
  }
}

class _Header extends StatelessWidget {
  const _Header({
    required this.title,
    required this.onBack,
    required this.onSave,
  });
  final String title;
  final VoidCallback onBack;
  final VoidCallback? onSave;
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
      child: Row(
        children: [
          InkWell(
            onTap: onBack,
            customBorder: const CircleBorder(),
            child: Container(
              width: 40,
              height: 40,
              decoration: const BoxDecoration(
                color: AppColors.surface,
                shape: BoxShape.circle,
              ),
              alignment: Alignment.center,
              child: const Icon(LucideIcons.arrowLeft,
                  size: 18, color: AppColors.textPrimary),
            ),
          ),
          Expanded(
            child: Center(
              child: Text(
                title,
                style: GoogleFonts.jetBrainsMono(
                  color: AppColors.textPrimary,
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 1.5,
                ),
              ),
            ),
          ),
          // "SAVE" pill — pen `GPI5m`: cornerRadius 14, padding [8,12],
          // fill accent. Text "SAVE" 10/700 letterSpacing 1 black.
          InkWell(
            onTap: onSave,
            borderRadius: BorderRadius.circular(14),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: AppColors.accent,
                borderRadius: BorderRadius.circular(14),
              ),
              child: Text(
                'SAVE',
                style: GoogleFonts.jetBrainsMono(
                  color: AppColors.background,
                  fontSize: 10,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 1,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.eyebrow, required this.children});
  final String eyebrow;
  final List<Widget> children;
  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          eyebrow,
          style: GoogleFonts.jetBrainsMono(
            color: AppColors.textSecondary,
            fontSize: 10,
            fontWeight: FontWeight.w700,
            letterSpacing: 1.5,
          ),
        ),
        const SizedBox(height: 10),
        Container(
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(14),
          ),
          child: Column(children: children),
        ),
      ],
    );
  }
}

class _Divider extends StatelessWidget {
  const _Divider();
  @override
  Widget build(BuildContext context) {
    return Container(height: 1, color: AppColors.border);
  }
}

class _InputRow extends StatefulWidget {
  const _InputRow({
    required this.label,
    required this.controller,
    required this.placeholder,
    this.trailing,
  });
  final String label;
  final TextEditingController controller;
  final String placeholder;
  final Widget? trailing;
  @override
  State<_InputRow> createState() => _InputRowState();
}

class _InputRowState extends State<_InputRow> {
  @override
  void initState() {
    super.initState();
    widget.controller.addListener(_rebuild);
  }

  @override
  void dispose() {
    widget.controller.removeListener(_rebuild);
    super.dispose();
  }

  void _rebuild() {
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      child: Row(
        children: [
          _Label(label: widget.label),
          const SizedBox(width: 10),
          Expanded(
            child: TextField(
              controller: widget.controller,
              cursorColor: AppColors.accent,
              style: GoogleFonts.jetBrainsMono(
                color: AppColors.textPrimary,
                fontSize: 13,
              ),
              decoration: InputDecoration(
                isDense: true,
                contentPadding: EdgeInsets.zero,
                border: InputBorder.none,
                enabledBorder: InputBorder.none,
                focusedBorder: InputBorder.none,
                hintText: widget.placeholder,
                hintStyle: GoogleFonts.jetBrainsMono(
                  color: AppColors.textTertiary,
                  fontSize: 13,
                ),
              ),
            ),
          ),
          if (widget.trailing != null) ...[
            const SizedBox(width: 8),
            widget.trailing!,
          ],
        ],
      ),
    );
  }
}

class _DateRow extends StatelessWidget {
  const _DateRow({
    required this.label,
    required this.value,
    required this.onTap,
    this.trailing,
  });
  final String label;
  final String value;
  final VoidCallback onTap;
  final Widget? trailing;
  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        child: Row(
          children: [
            _Label(label: label),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                value,
                style: GoogleFonts.jetBrainsMono(
                  color: AppColors.textPrimary,
                  fontSize: 13,
                ),
              ),
            ),
            if (trailing != null) ...[
              const SizedBox(width: 8),
              trailing!,
            ],
          ],
        ),
      ),
    );
  }
}

class _ToggleRow extends StatelessWidget {
  const _ToggleRow({
    required this.label,
    required this.value,
    required this.onTap,
    this.trailing,
  });
  final String label;
  final String value;
  final VoidCallback onTap;
  final Widget? trailing;
  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        child: Row(
          children: [
            _Label(label: label),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                value,
                style: GoogleFonts.jetBrainsMono(
                  color: AppColors.textPrimary,
                  fontSize: 13,
                ),
              ),
            ),
            if (trailing != null) ...[
              const SizedBox(width: 8),
              trailing!,
            ],
          ],
        ),
      ),
    );
  }
}

class _Label extends StatelessWidget {
  const _Label({required this.label});
  final String label;
  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 76,
      child: Text(
        label,
        style: GoogleFonts.jetBrainsMono(
          color: AppColors.textSecondary,
          fontSize: 10,
          fontWeight: FontWeight.w700,
          letterSpacing: 1,
        ),
      ),
    );
  }
}

class _AccentPill extends StatelessWidget {
  const _AccentPill({required this.label});
  final String label;
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: AppColors.accentDim,
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(
        label,
        style: GoogleFonts.jetBrainsMono(
          color: AppColors.accent,
          fontSize: 9,
          fontWeight: FontWeight.w700,
          letterSpacing: 1,
        ),
      ),
    );
  }
}

class _CtaButton extends StatelessWidget {
  const _CtaButton({
    required this.icon,
    required this.label,
    required this.loading,
    required this.onTap,
  });
  final IconData icon;
  final String label;
  final bool loading;
  final VoidCallback? onTap;
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(27),
        child: Container(
          height: 54,
          decoration: BoxDecoration(
            color: AppColors.accent,
            borderRadius: BorderRadius.circular(27),
          ),
          alignment: Alignment.center,
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              if (loading)
                const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: AppColors.background,
                  ),
                )
              else
                Icon(icon, size: 16, color: AppColors.background),
              const SizedBox(width: 8),
              Text(
                loading ? 'SAVING…' : label,
                style: GoogleFonts.jetBrainsMono(
                  color: AppColors.background,
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 1.5,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

Future<DateTime?> _pickDateTime(BuildContext context, DateTime seed) async {
  final now = DateTime.now();
  final d = await showDatePicker(
    context: context,
    initialDate: seed,
    firstDate: now.subtract(const Duration(days: 7)),
    lastDate: now.add(const Duration(days: 365)),
  );
  if (d == null || !context.mounted) return null;
  final t = await showTimePicker(
    context: context,
    initialTime: TimeOfDay.fromDateTime(seed),
  );
  if (t == null) return null;
  return DateTime(d.year, d.month, d.day, t.hour, t.minute);
}
