import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../../../core/theme/app_colors.dart';
import '../../domain/search_results.dart';
import '../providers/search_providers.dart';

/// MobileV3 Search — pen node `sIdEd` (MobileV2/Search).
///
/// Layout:
///   - searchBar: padding [10,16]. searchPill (cornerRadius 23, wm-surface,
///     1px wm-border, height 46, padding [0,16], gap 10): search icon 18
///     secondary + input 14/500 primary + clear btn (24×24 cornerRadius 12,
///     wm-surface-hover fill, X icon 14 secondary). NO back arrow.
///   - chips (padding [4,16,12,16], gap 8): each cornerRadius 14, padding
///     [6,12], gap 6. All: accent fill, "All" 11/700 black. Others:
///     wm-surface, 1px wm-border, icon 12 secondary + label 11/600 primary.
///   - results (layout vertical):
///     - secTop (padding [10,20,6,20] space_between): "TOP MATCH" accent
///       10/700 letterSpacing 1, count 10/600 wm-text-muted.
///     - topHit (wm-accent-dim, 3px accent left stroke, padding [12,20],
///       gap 6 vertical):
///       topHitRow gap 10: 32×32 accent circle + meta col gap 2 (name·time
///       11/500 secondary + subject 13/700 primary).
///       snippet 11/normal tertiary lineHeight 1.4.
///     - secMessages/People/Files (padding [14,20,6,20] space_between).
///     - Message row: (see inline below).
///     - People row: padding [10,20], gap 10. avatar 40 + col gap 2
///       (name 13/700 + "email · N messages" 11/500 tertiary) + chevron 16.
///     - File row: padding [10,20], gap 10. icon 40×40 cornerRadius 8
///       wm-surface + 1px border + file-text 18 error. col gap 2: filename
///       13/600 primary + "sender · size · date" 11/500 tertiary.
class SearchScreenV3 extends ConsumerStatefulWidget {
  const SearchScreenV3({super.key});

  @override
  ConsumerState<SearchScreenV3> createState() => _SearchScreenV3State();
}

class _SearchScreenV3State extends ConsumerState<SearchScreenV3> {
  late final TextEditingController _controller;
  late final FocusNode _focus;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(
      text: ref.read(rawSearchQueryProvider),
    );
    _focus = FocusNode();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _focus.requestFocus();
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    _focus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final results = ref.watch(searchResultsProvider);
    final filter = ref.watch(searchFilterProvider);
    final rawQuery = ref.watch(rawSearchQueryProvider);

    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _SearchBar(
              controller: _controller,
              focusNode: _focus,
              onChanged: (v) =>
                  ref.read(rawSearchQueryProvider.notifier).state = v,
              onClear: () {
                _controller.clear();
                ref.read(rawSearchQueryProvider.notifier).state = '';
                _focus.requestFocus();
              },
              onBack: () => Navigator.of(context).maybePop(),
            ),
            _Chips(
              current: filter,
              onChange: (f) =>
                  ref.read(searchFilterProvider.notifier).state = f,
            ),
            Expanded(
              child: rawQuery.trim().isEmpty
                  ? const _EmptyPrompt()
                  : results.when(
                      data: (r) => r.isEmpty
                          ? _NoResults(query: rawQuery)
                          : _ResultsList(results: r),
                      loading: () => const _LoadingState(),
                      error: (_, __) => const _ErrorState(),
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Search bar with a leading back arrow, centered input, and a
/// state-aware trailing button: when the input has text we show a
/// clear-X (reset only the query); when empty we show a close-X that
/// pops the page.
class _SearchBar extends StatelessWidget {
  const _SearchBar({
    required this.controller,
    required this.focusNode,
    required this.onChanged,
    required this.onClear,
    required this.onBack,
  });
  final TextEditingController controller;
  final FocusNode focusNode;
  final ValueChanged<String> onChanged;
  final VoidCallback onClear;
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 10, 16, 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          // Leading back arrow — replaces the design's static search
          // icon with a functional dismiss control per product spec.
          IconButton(
            icon: const Icon(LucideIcons.arrowLeft,
                color: AppColors.textPrimary, size: 20),
            onPressed: onBack,
          ),
          Expanded(
            child: Container(
              height: 46,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              decoration: BoxDecoration(
                color: AppColors.surface,
                borderRadius: BorderRadius.circular(23),
                border: Border.all(color: AppColors.border, width: 1),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  Expanded(
                    child: TextField(
                      controller: controller,
                      focusNode: focusNode,
                      onChanged: onChanged,
                      textInputAction: TextInputAction.search,
                      cursorColor: AppColors.accent,
                      // Vertically centre the text inside the 46-tall pill.
                      // Without this the baseline sits on the top edge
                      // under some font metrics.
                      textAlignVertical: TextAlignVertical.center,
                      style: GoogleFonts.jetBrainsMono(
                        color: AppColors.textPrimary,
                        fontSize: 14,
                        fontWeight: FontWeight.w500,
                      ),
                      decoration: InputDecoration(
                        // Explicitly strip every border variant so
                        // Flutter's default focus outline never paints.
                        border: InputBorder.none,
                        enabledBorder: InputBorder.none,
                        focusedBorder: InputBorder.none,
                        disabledBorder: InputBorder.none,
                        errorBorder: InputBorder.none,
                        focusedErrorBorder: InputBorder.none,
                        contentPadding: EdgeInsets.zero,
                        isDense: true,
                        hintText: 'Search mail, people, files',
                        hintStyle: GoogleFonts.jetBrainsMono(
                          color: AppColors.textSecondary,
                          fontSize: 14,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  // State-aware trailing icon: clear-X when there's
                  // text, close-X (dismiss) when the field is empty.
                  _TrailingButton(
                    controller: controller,
                    onClear: onClear,
                    onBack: onBack,
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _TrailingButton extends StatelessWidget {
  const _TrailingButton({
    required this.controller,
    required this.onClear,
    required this.onBack,
  });
  final TextEditingController controller;
  final VoidCallback onClear;
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    // Rebuild whenever the controller's value changes so we can swap
    // behaviour between "clear" and "close" without making the whole
    // _SearchBar stateful.
    return ValueListenableBuilder<TextEditingValue>(
      valueListenable: controller,
      builder: (context, value, _) {
        final hasText = value.text.isNotEmpty;
        return GestureDetector(
          onTap: hasText ? onClear : onBack,
          child: Container(
            width: 24,
            height: 24,
            decoration: BoxDecoration(
              color: AppColors.surfaceElevated,
              borderRadius: BorderRadius.circular(12),
            ),
            alignment: Alignment.center,
            child: const Icon(LucideIcons.x,
                color: AppColors.textSecondary, size: 14),
          ),
        );
      },
    );
  }
}

class _Chips extends StatelessWidget {
  const _Chips({required this.current, required this.onChange});
  final SearchFilter current;
  final ValueChanged<SearchFilter> onChange;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
      child: Row(
        children: [
          _Chip(
            label: 'All',
            active: current == SearchFilter.all,
            onTap: () => onChange(SearchFilter.all),
          ),
          const SizedBox(width: 8),
          _Chip(
            icon: LucideIcons.user,
            label: 'From',
            active: current == SearchFilter.from,
            onTap: () => onChange(SearchFilter.from),
          ),
          const SizedBox(width: 8),
          _Chip(
            icon: LucideIcons.paperclip,
            label: 'Files',
            active: current == SearchFilter.files,
            onTap: () => onChange(SearchFilter.files),
          ),
          const SizedBox(width: 8),
          _Chip(
            icon: LucideIcons.calendar,
            label: 'Date',
            active: current == SearchFilter.date,
            onTap: () => onChange(SearchFilter.date),
          ),
        ],
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({
    required this.label,
    required this.active,
    required this.onTap,
    this.icon,
  });
  final String label;
  final bool active;
  final VoidCallback onTap;
  final IconData? icon;
  @override
  Widget build(BuildContext context) {
    final textColor = active ? AppColors.background : AppColors.textPrimary;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: active ? AppColors.accent : AppColors.surface,
          borderRadius: BorderRadius.circular(14),
          border: active
              ? null
              : Border.all(color: AppColors.border, width: 1),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (icon != null) ...[
              Icon(icon, size: 12, color: AppColors.textSecondary),
              const SizedBox(width: 6),
            ],
            Text(
              label,
              style: GoogleFonts.jetBrainsMono(
                color: textColor,
                fontSize: 11,
                fontWeight: active ? FontWeight.w700 : FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ResultsList extends StatelessWidget {
  const _ResultsList({required this.results});
  final SearchResults results;
  @override
  Widget build(BuildContext context) {
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: EdgeInsets.zero,
      children: [
        if (results.topMatch != null) ...[
          _SectionHeader(label: 'TOP MATCH', count: 1, accent: true),
          _TopHit(match: results.topMatch!),
        ],
        if (results.messages.isNotEmpty) ...[
          _SectionHeader(label: 'MESSAGES', count: results.messages.length),
          for (final m in results.messages) _MessageRow(message: m),
        ],
        if (results.people.isNotEmpty) ...[
          _SectionHeader(label: 'PEOPLE', count: results.people.length),
          for (final p in results.people) _PersonRow(person: p),
        ],
        if (results.files.isNotEmpty) ...[
          _SectionHeader(label: 'FILES', count: results.files.length),
          for (final f in results.files) _FileRow(file: f),
        ],
        const SizedBox(height: 24),
      ],
    );
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({
    required this.label,
    required this.count,
    this.accent = false,
  });
  final String label;
  final int count;
  final bool accent;
  @override
  Widget build(BuildContext context) {
    // Design secTop padding [10,20,6,20]; other sections [14,20,6,20].
    return Padding(
      padding: accent
          ? const EdgeInsets.fromLTRB(20, 10, 20, 6)
          : const EdgeInsets.fromLTRB(20, 14, 20, 6),
      child: Row(
        children: [
          Expanded(
            child: Text(
              label,
              style: GoogleFonts.jetBrainsMono(
                color: accent ? AppColors.accent : AppColors.textTertiary,
                fontSize: 10,
                fontWeight: FontWeight.w700,
                letterSpacing: 1,
              ),
            ),
          ),
          Text(
            '$count',
            style: GoogleFonts.jetBrainsMono(
              color: AppColors.textMuted,
              fontSize: 10,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

class _TopHit extends StatelessWidget {
  const _TopHit({required this.match});
  final SearchTopMatch match;
  @override
  Widget build(BuildContext context) {
    // Design topHit: fill accent-dim, 3px accent left stroke, padding
    // [12,20], gap 6.
    return InkWell(
      onTap: () => context.push('/email/${match.emailId}'),
      child: Container(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 12),
        decoration: BoxDecoration(
          color: AppColors.accentDim,
          border: const Border(
            left: BorderSide(color: AppColors.accent, width: 3),
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _TopAvatar(name: match.fromName),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '${match.fromName} · ${_fmtShort(match.createdAt)}',
                        style: GoogleFonts.jetBrainsMono(
                          color: AppColors.textSecondary,
                          fontSize: 11,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        match.subject,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: GoogleFonts.jetBrainsMono(
                          color: AppColors.textPrimary,
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 6),
            Text(
              '…${match.snippet.trim()}…',
              maxLines: 3,
              overflow: TextOverflow.ellipsis,
              style: GoogleFonts.jetBrainsMono(
                color: AppColors.textTertiary,
                fontSize: 11,
                height: 1.4,
              ),
            ),
          ],
        ),
      ),
    );
  }

  static String _fmtShort(DateTime t) {
    final h = t.hour.toString().padLeft(2, '0');
    final m = t.minute.toString().padLeft(2, '0');
    return '$h:$m';
  }
}

class _TopAvatar extends StatelessWidget {
  const _TopAvatar({required this.name});
  final String name;
  @override
  Widget build(BuildContext context) {
    // Design topAv: 32×32 cornerRadius 16 accent, "SK" 11/700 black mono.
    return Container(
      width: 32,
      height: 32,
      decoration: const BoxDecoration(
        color: AppColors.accent,
        shape: BoxShape.circle,
      ),
      alignment: Alignment.center,
      child: Text(
        _initials(name),
        style: GoogleFonts.jetBrainsMono(
          color: AppColors.background,
          fontSize: 11,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }

  static String _initials(String name) {
    if (name.isEmpty) return '?';
    final parts = name.split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
    if (parts.length >= 2) return (parts.first[0] + parts.last[0]).toUpperCase();
    return parts.first.length >= 2
        ? parts.first.substring(0, 2).toUpperCase()
        : parts.first[0].toUpperCase();
  }
}

class _MessageRow extends StatelessWidget {
  const _MessageRow({required this.message});
  final SearchMessage message;
  @override
  Widget build(BuildContext context) {
    // Message rows in the pen use the EmailRowWithAttachments component.
    // We render an equivalent compact row: padding [12,20] gap 12.
    return InkWell(
      onTap: () => context.push('/email/${message.emailId}'),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    message.fromName,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: GoogleFonts.jetBrainsMono(
                      color: AppColors.textPrimary,
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                Text(
                  _fmtDate(message.createdAt),
                  style: GoogleFonts.jetBrainsMono(
                    color: AppColors.textTertiary,
                    fontSize: 11,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 2),
            Text(
              message.subject,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: GoogleFonts.jetBrainsMono(
                color: AppColors.textPrimary,
                fontSize: 13,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              message.snippet,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: GoogleFonts.jetBrainsMono(
                color: AppColors.textTertiary,
                fontSize: 11,
              ),
            ),
          ],
        ),
      ),
    );
  }

  static String _fmtDate(DateTime d) {
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
    ];
    return '${months[d.month - 1]} ${d.day}';
  }
}

class _PersonRow extends StatelessWidget {
  const _PersonRow({required this.person});
  final SearchPerson person;
  @override
  Widget build(BuildContext context) {
    // Design peopleRow: padding [10,20], gap 10, alignItems center.
    return InkWell(
      onTap: () {},
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            _PersonAvatar(name: person.name),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    person.name.isEmpty ? person.email : person.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: GoogleFonts.jetBrainsMono(
                      color: AppColors.textPrimary,
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    person.messageCount > 0
                        ? '${person.email} · ${person.messageCount} messages'
                        : person.email,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: GoogleFonts.jetBrainsMono(
                      color: AppColors.textTertiary,
                      fontSize: 11,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ),
            const Icon(LucideIcons.chevronRight,
                color: AppColors.textTertiary, size: 16),
          ],
        ),
      ),
    );
  }
}

class _PersonAvatar extends StatelessWidget {
  const _PersonAvatar({required this.name});
  final String name;
  @override
  Widget build(BuildContext context) {
    // Design pav: 40×40 cornerRadius 20 accent, initials 12/700 black.
    return Container(
      width: 40,
      height: 40,
      decoration: const BoxDecoration(
        color: AppColors.accent,
        shape: BoxShape.circle,
      ),
      alignment: Alignment.center,
      child: Text(
        _initials(name),
        style: GoogleFonts.jetBrainsMono(
          color: AppColors.background,
          fontSize: 12,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }

  static String _initials(String name) {
    if (name.isEmpty) return '?';
    final parts = name.split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
    if (parts.length >= 2) return (parts.first[0] + parts.last[0]).toUpperCase();
    return parts.first.length >= 2
        ? parts.first.substring(0, 2).toUpperCase()
        : parts.first[0].toUpperCase();
  }
}

class _FileRow extends StatelessWidget {
  const _FileRow({required this.file});
  final SearchFile file;
  @override
  Widget build(BuildContext context) {
    // Design fileRow: padding [10,20], gap 10, alignItems center.
    return InkWell(
      onTap: () => context.push('/email/${file.emailId}'),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: AppColors.surface,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: AppColors.border, width: 1),
              ),
              alignment: Alignment.center,
              child: const Icon(LucideIcons.fileText,
                  color: AppColors.danger, size: 18),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    file.filename,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: GoogleFonts.jetBrainsMono(
                      color: AppColors.textPrimary,
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    '${file.fromName} · ${_fmtSize(file.sizeBytes)} · ${_fmtDate(file.createdAt)}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: GoogleFonts.jetBrainsMono(
                      color: AppColors.textTertiary,
                      fontSize: 11,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  static String _fmtSize(int bytes) {
    if (bytes < 1024) return '${bytes}B';
    if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(0)}KB';
    return '${(bytes / (1024 * 1024)).toStringAsFixed(1)}MB';
  }

  static String _fmtDate(DateTime d) {
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
    ];
    return '${months[d.month - 1]} ${d.day}';
  }
}

class _EmptyPrompt extends StatelessWidget {
  const _EmptyPrompt();
  @override
  Widget build(BuildContext context) {
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      children: [
        const SizedBox(height: 80),
        const Icon(LucideIcons.search,
            color: AppColors.textTertiary, size: 48),
        const SizedBox(height: 12),
        Center(
          child: Text(
            'Search everything',
            style: GoogleFonts.jetBrainsMono(
              color: AppColors.textPrimary,
              fontSize: 14,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
      ],
    );
  }
}

class _NoResults extends StatelessWidget {
  const _NoResults({required this.query});
  final String query;
  @override
  Widget build(BuildContext context) {
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      children: [
        const SizedBox(height: 80),
        const Icon(LucideIcons.searchX,
            color: AppColors.textTertiary, size: 48),
        const SizedBox(height: 12),
        Center(
          child: Text(
            'No matches for "$query"',
            style: GoogleFonts.jetBrainsMono(
              color: AppColors.textPrimary,
              fontSize: 14,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
      ],
    );
  }
}

class _LoadingState extends StatelessWidget {
  const _LoadingState();
  @override
  Widget build(BuildContext context) {
    return const Center(
      child: CircularProgressIndicator(color: AppColors.accent, strokeWidth: 2),
    );
  }
}

class _ErrorState extends StatelessWidget {
  const _ErrorState();
  @override
  Widget build(BuildContext context) {
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      children: [
        const SizedBox(height: 80),
        const Icon(LucideIcons.cloudOff,
            color: AppColors.textTertiary, size: 48),
        const SizedBox(height: 12),
        Center(
          child: Text(
            "Couldn't search",
            style: GoogleFonts.jetBrainsMono(
              color: AppColors.textPrimary,
              fontSize: 14,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
      ],
    );
  }
}
