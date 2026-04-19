import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../domain/email.dart';
import '../providers/mail_providers.dart';
import '../widgets/email_list_item.dart';

/// Mobile/MailSearch — design.lib.pen node `xsMcC`. Sharp search input,
/// filter chips with lime active state, mono "N RESULTS" header.
class MailSearchScreen extends ConsumerStatefulWidget {
  const MailSearchScreen({super.key});

  @override
  ConsumerState<MailSearchScreen> createState() => _MailSearchScreenState();
}

class _MailSearchScreenState extends ConsumerState<MailSearchScreen> {
  final _controller = TextEditingController();
  Timer? _debounce;
  String _lastQuery = '';
  List<Email> _results = const [];
  bool _loading = false;
  String? _error;
  _SearchFilter _filter = _SearchFilter.all;

  @override
  void dispose() {
    _debounce?.cancel();
    _controller.dispose();
    super.dispose();
  }

  void _onChanged(String value) {
    _debounce?.cancel();
    final trimmed = value.trim();
    if (trimmed.isEmpty) {
      setState(() {
        _results = const [];
        _error = null;
        _loading = false;
      });
      return;
    }
    _debounce = Timer(const Duration(milliseconds: 300), () => _run(trimmed));
  }

  Future<void> _run(String query) async {
    setState(() {
      _loading = true;
      _error = null;
      _lastQuery = query;
    });
    try {
      final repo = await ref.read(mailRepositoryProvider.future);
      final page = await repo.search(query);
      if (!mounted || _lastQuery != query) return;
      setState(() {
        _results = _applyFilter(page.emails);
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = _format(e);
        _loading = false;
      });
    }
  }

  List<Email> _applyFilter(List<Email> emails) {
    switch (_filter) {
      case _SearchFilter.all:
        return emails;
      case _SearchFilter.from:
        final q = _lastQuery.toLowerCase();
        return emails.where((e) => e.fromAddress.toLowerCase().contains(q)).toList();
      case _SearchFilter.subject:
        final q = _lastQuery.toLowerCase();
        return emails.where((e) => e.subject.toLowerCase().contains(q)).toList();
      case _SearchFilter.attachments:
        return emails.where((e) => e.attachments.isNotEmpty).toList();
    }
  }

  String _format(Object error) {
    final msg = error.toString();
    final m = RegExp(r'ApiException\([^)]*\):\s*(.*)$').firstMatch(msg);
    return m != null ? m.group(1)! : 'Search failed.';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: Column(
          children: [
            _SearchHeader(
              controller: _controller,
              onChanged: _onChanged,
              onClear: () {
                _controller.clear();
                _onChanged('');
              },
              onBack: () => context.pop(),
            ),
            _FilterBar(
              selected: _filter,
              onSelect: (f) {
                setState(() => _filter = f);
                if (_lastQuery.isNotEmpty) _run(_lastQuery);
              },
            ),
            if (_lastQuery.isNotEmpty)
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 12, 20, 8),
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: Text(
                    '${_results.length} RESULTS',
                    style: AppTextStyles.sectionLabel,
                  ),
                ),
              ),
            Expanded(child: _body()),
          ],
        ),
      ),
    );
  }

  Widget _body() {
    if (_loading) {
      return const Center(
        child: SizedBox(
          width: 22,
          height: 22,
          child: CircularProgressIndicator(
              strokeWidth: 2, color: AppColors.accent),
        ),
      );
    }
    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Text(_error!,
              style: AppTextStyles.bodySmall.copyWith(color: AppColors.danger)),
        ),
      );
    }
    if (_lastQuery.isEmpty) {
      return Center(
        child: Text('Type to search your inbox', style: AppTextStyles.bodySmall),
      );
    }
    if (_results.isEmpty) {
      return Center(
        child: Text(
          'No results for "$_lastQuery"',
          style: AppTextStyles.bodySmall,
        ),
      );
    }
    return ListView.separated(
      itemCount: _results.length,
      separatorBuilder: (_, __) =>
          const Divider(height: 1, color: AppColors.border),
      itemBuilder: (context, index) => EmailListItem(email: _results[index]),
    );
  }
}

class _SearchHeader extends StatelessWidget {
  const _SearchHeader({
    required this.controller,
    required this.onChanged,
    required this.onClear,
    required this.onBack,
  });
  final TextEditingController controller;
  final ValueChanged<String> onChanged;
  final VoidCallback onClear;
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 8, 16, 8),
      child: Row(
        children: [
          IconButton(
            splashRadius: 22,
            icon: const Icon(Icons.arrow_back, size: 22),
            color: AppColors.textSecondary,
            onPressed: onBack,
          ),
          Expanded(
            child: Container(
              decoration: const BoxDecoration(
                color: AppColors.surface,
                border: Border.fromBorderSide(
                  BorderSide(color: AppColors.border, width: 1),
                ),
              ),
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      key: const Key('search-field'),
                      controller: controller,
                      autofocus: true,
                      onChanged: onChanged,
                      cursorColor: AppColors.accent,
                      style: AppTextStyles.monoSmall.copyWith(
                        color: AppColors.textPrimary,
                        fontSize: 13,
                      ),
                      decoration: InputDecoration(
                        isCollapsed: true,
                        contentPadding:
                            const EdgeInsets.symmetric(vertical: 12),
                        border: InputBorder.none,
                        hintText: 'product roadmap',
                        hintStyle: AppTextStyles.monoSmall
                            .copyWith(color: AppColors.textTertiary),
                      ),
                    ),
                  ),
                  if (controller.text.isNotEmpty)
                    IconButton(
                      splashRadius: 16,
                      icon: const Icon(Icons.close,
                          color: AppColors.textTertiary, size: 16),
                      onPressed: onClear,
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

enum _SearchFilter { all, from, subject, attachments }

class _FilterBar extends StatelessWidget {
  const _FilterBar({required this.selected, required this.onSelect});
  final _SearchFilter selected;
  final ValueChanged<_SearchFilter> onSelect;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Row(
        children: [
          _Chip(label: 'All', selected: selected == _SearchFilter.all, onTap: () => onSelect(_SearchFilter.all)),
          const SizedBox(width: 8),
          _Chip(label: 'From', selected: selected == _SearchFilter.from, onTap: () => onSelect(_SearchFilter.from)),
          const SizedBox(width: 8),
          _Chip(label: 'Subject', selected: selected == _SearchFilter.subject, onTap: () => onSelect(_SearchFilter.subject)),
          const SizedBox(width: 8),
          _Chip(label: 'Has attachment', selected: selected == _SearchFilter.attachments, onTap: () => onSelect(_SearchFilter.attachments)),
        ],
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({required this.label, required this.selected, required this.onTap});
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
        decoration: BoxDecoration(
          color: selected ? AppColors.accentDim : AppColors.surface,
          border: Border.all(
            color: selected ? AppColors.accent : AppColors.border,
            width: 1,
          ),
        ),
        child: Text(
          label,
          style: GoogleFonts.jetBrainsMono(
            fontSize: 11,
            fontWeight: FontWeight.w600,
            color: selected ? AppColors.accent : AppColors.textSecondary,
          ),
        ),
      ),
    );
  }
}
