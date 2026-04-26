import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../../core/widgets/wm_app_bar.dart';
import '../../../../core/widgets/wm_avatar.dart';
import '../../../../core/widgets/wm_primary_button.dart';
import '../../domain/contact.dart';
import '../providers/chat_providers.dart';

/// Mobile group-create flow. The user enters a title, searches for
/// teammates, and taps to multi-select. "Create group" hits the
/// `/chat/conversations/group` endpoint and pushes the new thread.
class CreateGroupScreen extends ConsumerStatefulWidget {
  const CreateGroupScreen({super.key});

  @override
  ConsumerState<CreateGroupScreen> createState() => _CreateGroupScreenState();
}

class _CreateGroupScreenState extends ConsumerState<CreateGroupScreen> {
  final _titleController = TextEditingController();
  final _searchController = TextEditingController();
  final _selected = <String, Contact>{};

  String _query = '';
  List<Contact> _results = const [];
  bool _searching = false;
  bool _creating = false;
  String? _error;
  Timer? _debounce;

  @override
  void dispose() {
    _debounce?.cancel();
    _titleController.dispose();
    _searchController.dispose();
    super.dispose();
  }

  void _onQueryChanged(String value) {
    setState(() {
      _query = value;
      _error = null;
    });
    _debounce?.cancel();
    final trimmed = value.trim();
    if (trimmed.isEmpty) {
      setState(() {
        _results = const [];
        _searching = false;
      });
      return;
    }
    setState(() => _searching = true);
    _debounce = Timer(const Duration(milliseconds: 250), () {
      _runSearch(trimmed);
    });
  }

  Future<void> _runSearch(String trimmed) async {
    try {
      final repo = await ref.read(chatRepositoryProvider.future);
      final users = await repo.searchUsers(trimmed);
      if (!mounted) return;
      if (trimmed != _searchController.text.trim()) return;
      setState(() {
        _results = users;
        _searching = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _searching = false;
        _error = _format(e);
      });
    }
  }

  void _toggleSelect(Contact c) {
    setState(() {
      if (_selected.containsKey(c.id)) {
        _selected.remove(c.id);
      } else {
        _selected[c.id] = c;
      }
    });
  }

  Future<void> _createGroup() async {
    final title = _titleController.text.trim();
    if (title.isEmpty) {
      setState(() => _error = 'Give the group a name.');
      return;
    }
    if (_selected.isEmpty) {
      setState(() => _error = 'Pick at least one teammate.');
      return;
    }

    setState(() {
      _creating = true;
      _error = null;
    });

    try {
      final repo = await ref.read(chatRepositoryProvider.future);
      final id = await repo.createGroupConversation(
        title: title,
        participantIds: _selected.keys.toList(),
      );
      ref.invalidate(chatListControllerProvider);
      if (!mounted) return;
      context.pushReplacement('/conversation/$id');
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _creating = false;
        _error = _format(e);
      });
    }
  }

  String _format(Object error) {
    final msg = error.toString();
    final m = RegExp(r'ApiException\([^)]*\):\s*(.*)$').firstMatch(msg);
    return m != null ? m.group(1)! : 'Could not create group.';
  }

  @override
  Widget build(BuildContext context) {
    final selectedList = _selected.values.toList();
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: const WmAppBar(title: 'New Group'),
      body: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const SizedBox(height: 16),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: Text('GROUP NAME', style: AppTextStyles.sectionLabel),
            ),
            const SizedBox(height: 8),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: Container(
                decoration: const BoxDecoration(
                  color: AppColors.surface,
                  border: Border.fromBorderSide(
                    BorderSide(color: AppColors.border, width: 1),
                  ),
                ),
                child: TextField(
                  key: const Key('create-group-title'),
                  controller: _titleController,
                  cursorColor: AppColors.accent,
                  style: AppTextStyles.monoSmall.copyWith(
                    color: AppColors.textPrimary,
                    fontSize: 13,
                  ),
                  decoration: InputDecoration(
                    hintText: 'e.g. Engineering',
                    hintStyle: AppTextStyles.monoSmall.copyWith(
                      color: AppColors.textTertiary,
                      fontSize: 13,
                    ),
                    border: InputBorder.none,
                    isCollapsed: true,
                    contentPadding:
                        const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 24),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: Row(
                children: [
                  Text('MEMBERS', style: AppTextStyles.sectionLabel),
                  const SizedBox(width: 8),
                  if (selectedList.isNotEmpty)
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 6, vertical: 2),
                      color: AppColors.accentDim,
                      child: Text(
                        '${selectedList.length}',
                        style: GoogleFonts.jetBrainsMono(
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                          color: AppColors.accent,
                        ),
                      ),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 8),
            if (selectedList.isNotEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    for (final c in selectedList)
                      InkWell(
                        onTap: () => _toggleSelect(c),
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 8, vertical: 4),
                          decoration: BoxDecoration(
                            color: AppColors.accentDim,
                            border: Border.all(
                              color: AppColors.accent.withValues(alpha: 0.4),
                            ),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(
                                c.name,
                                style: GoogleFonts.jetBrainsMono(
                                  fontSize: 11,
                                  color: AppColors.textPrimary,
                                ),
                              ),
                              const SizedBox(width: 4),
                              const Icon(Icons.close,
                                  size: 12, color: AppColors.textTertiary),
                            ],
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            const SizedBox(height: 12),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: Container(
                decoration: const BoxDecoration(
                  color: AppColors.surface,
                  border: Border.fromBorderSide(
                    BorderSide(color: AppColors.border, width: 1),
                  ),
                ),
                child: Row(
                  children: [
                    const Padding(
                      padding: EdgeInsets.only(left: 14, right: 8),
                      child: Icon(Icons.search,
                          size: 16, color: AppColors.textTertiary),
                    ),
                    Expanded(
                      child: TextField(
                        key: const Key('create-group-search'),
                        controller: _searchController,
                        cursorColor: AppColors.accent,
                        style: AppTextStyles.monoSmall.copyWith(
                          color: AppColors.textPrimary,
                          fontSize: 13,
                        ),
                        decoration: InputDecoration(
                          hintText: 'Search teammates…',
                          hintStyle: AppTextStyles.monoSmall.copyWith(
                            color: AppColors.textTertiary,
                            fontSize: 13,
                          ),
                          border: InputBorder.none,
                          isCollapsed: true,
                          contentPadding:
                              const EdgeInsets.symmetric(vertical: 14),
                        ),
                        onChanged: _onQueryChanged,
                      ),
                    ),
                    if (_searching)
                      const Padding(
                        padding: EdgeInsets.only(right: 12),
                        child: SizedBox(
                          width: 14,
                          height: 14,
                          child: CircularProgressIndicator(
                            strokeWidth: 1.6,
                            color: AppColors.accent,
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 12),
            if (_query.trim().isEmpty)
              Padding(
                padding:
                    const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
                child: Text(
                  'Search and tap teammates to add them.',
                  style: AppTextStyles.bodySmall
                      .copyWith(color: AppColors.textTertiary),
                ),
              )
            else if (!_searching && _results.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: Text(
                  'No matches.',
                  style: AppTextStyles.bodySmall
                      .copyWith(color: AppColors.textTertiary),
                ),
              )
            else
              Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  for (final c in _results) ...[
                    _SelectableRow(
                      contact: c,
                      selected: _selected.containsKey(c.id),
                      onTap: () => _toggleSelect(c),
                    ),
                    const Divider(color: AppColors.border, height: 1),
                  ],
                ],
              ),
            const SizedBox(height: 24),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (_error != null) ...[
                    Text(
                      _error!,
                      style: AppTextStyles.bodySmall
                          .copyWith(color: AppColors.danger),
                    ),
                    const SizedBox(height: 12),
                  ],
                  WmPrimaryButton(
                    key: const Key('create-group-submit'),
                    label: _creating
                        ? 'Creating…'
                        : 'Create group${selectedList.isNotEmpty ? ' (${selectedList.length})' : ''}',
                    loading: _creating,
                    onPressed: _createGroup,
                  ),
                ],
              ),
            ),
            const SizedBox(height: 32),
          ],
        ),
      ),
    );
  }
}

class _SelectableRow extends StatelessWidget {
  const _SelectableRow({
    required this.contact,
    required this.selected,
    required this.onTap,
  });
  final Contact contact;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        splashColor: AppColors.surface,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
          child: Row(
            children: [
              WmAvatar(name: contact.name, size: 36),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(contact.name,
                        style: GoogleFonts.inter(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          color: AppColors.textPrimary,
                        )),
                    const SizedBox(height: 2),
                    Text(contact.email, style: AppTextStyles.monoSmall),
                  ],
                ),
              ),
              Container(
                width: 22,
                height: 22,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: selected ? AppColors.accent : AppColors.surface,
                  border: Border.all(
                    color: selected ? AppColors.accent : AppColors.border,
                  ),
                ),
                child: selected
                    ? const Icon(Icons.check,
                        size: 14, color: Colors.black)
                    : null,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
