import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../../../core/theme/app_colors.dart';
import '../../domain/email.dart';
import '../providers/mail_providers.dart';
import '../widgets/email_list_item.dart';

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
    final match = RegExp(r'ApiException\([^)]*\):\s*(.*)$').firstMatch(msg);
    return match != null ? match.group(1)! : 'Search failed.';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.background,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: AppColors.textPrimary),
          onPressed: () => context.pop(),
        ),
        titleSpacing: 0,
        title: Container(
          margin: const EdgeInsets.only(right: 16),
          padding: const EdgeInsets.symmetric(horizontal: 12),
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(8),
          ),
          child: TextField(
            key: const Key('search-field'),
            controller: _controller,
            autofocus: true,
            onChanged: _onChanged,
            style: GoogleFonts.inter(fontSize: 14, color: AppColors.textPrimary),
            decoration: InputDecoration(
              border: InputBorder.none,
              hintText: 'Search emails',
              hintStyle: GoogleFonts.inter(fontSize: 14, color: AppColors.textTertiary),
              suffixIcon: _controller.text.isEmpty
                  ? null
                  : IconButton(
                      icon: const Icon(Icons.close, color: AppColors.textTertiary, size: 18),
                      onPressed: () {
                        _controller.clear();
                        _onChanged('');
                      },
                    ),
            ),
          ),
        ),
      ),
      body: Column(
        children: [
          _FilterBar(
            selected: _filter,
            onSelect: (f) {
              setState(() => _filter = f);
              if (_lastQuery.isNotEmpty) _run(_lastQuery);
            },
          ),
          if (_lastQuery.isNotEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  '${_results.length} RESULTS',
                  style: GoogleFonts.inter(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: AppColors.textSecondary,
                    letterSpacing: 0.8,
                  ),
                ),
              ),
            ),
          Expanded(child: _body()),
        ],
      ),
    );
  }

  Widget _body() {
    if (_loading) {
      return const Center(
        child: SizedBox(
          width: 24,
          height: 24,
          child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.accent),
        ),
      );
    }
    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Text(
            _error!,
            style: GoogleFonts.inter(fontSize: 13, color: AppColors.badgeRed),
          ),
        ),
      );
    }
    if (_lastQuery.isEmpty) {
      return Center(
        child: Text(
          'Type to search your inbox',
          style: GoogleFonts.inter(fontSize: 13, color: AppColors.textSecondary),
        ),
      );
    }
    if (_results.isEmpty) {
      return Center(
        child: Text(
          'No results for "$_lastQuery"',
          style: GoogleFonts.inter(fontSize: 13, color: AppColors.textSecondary),
        ),
      );
    }
    return ListView.separated(
      itemCount: _results.length,
      separatorBuilder: (context, index) => const Divider(height: 1, color: AppColors.border),
      itemBuilder: (context, index) => EmailListItem(email: _results[index]),
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
          _Chip(label: 'All', isSelected: selected == _SearchFilter.all, onTap: () => onSelect(_SearchFilter.all)),
          const SizedBox(width: 8),
          _Chip(label: 'From', isSelected: selected == _SearchFilter.from, onTap: () => onSelect(_SearchFilter.from)),
          const SizedBox(width: 8),
          _Chip(label: 'Subject', isSelected: selected == _SearchFilter.subject, onTap: () => onSelect(_SearchFilter.subject)),
          const SizedBox(width: 8),
          _Chip(label: 'Has attachment', isSelected: selected == _SearchFilter.attachments, onTap: () => onSelect(_SearchFilter.attachments)),
        ],
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({required this.label, required this.isSelected, required this.onTap});
  final String label;
  final bool isSelected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: isSelected ? AppColors.accent : AppColors.surface,
          borderRadius: BorderRadius.circular(6),
          border: Border.all(
            color: isSelected ? AppColors.accent : AppColors.border,
          ),
        ),
        child: Text(
          label,
          style: GoogleFonts.inter(
            fontSize: 13,
            fontWeight: FontWeight.w600,
            color: isSelected ? AppColors.background : AppColors.textSecondary,
          ),
        ),
      ),
    );
  }
}
