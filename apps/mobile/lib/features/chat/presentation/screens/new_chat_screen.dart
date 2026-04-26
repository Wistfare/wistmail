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

/// Mobile/NewChat — search-by-name/email picker with a manual
/// "enter an email" fallback. Replaces the previous static contact
/// list with the live `/api/v1/chat/users/search` endpoint.
class NewChatScreen extends ConsumerStatefulWidget {
  const NewChatScreen({super.key});

  @override
  ConsumerState<NewChatScreen> createState() => _NewChatScreenState();
}

class _NewChatScreenState extends ConsumerState<NewChatScreen> {
  final _searchController = TextEditingController();
  final _emailController = TextEditingController();

  String _query = '';
  List<Contact> _results = const [];
  bool _searching = false;
  bool _creating = false;
  String? _error;
  Timer? _debounce;

  @override
  void dispose() {
    _debounce?.cancel();
    _searchController.dispose();
    _emailController.dispose();
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
      // Drop late results that no longer match the input.
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

  Future<void> _createDirect([String? overrideEmail]) async {
    final email = (overrideEmail ?? _emailController.text).trim();
    if (email.isEmpty) {
      setState(() => _error = "Enter the person's email");
      return;
    }
    setState(() {
      _creating = true;
      _error = null;
    });

    try {
      final repo = await ref.read(chatRepositoryProvider.future);
      final id = await repo.createDirectConversation(email);
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
    return m != null ? m.group(1)! : 'Could not start chat.';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: const WmAppBar(title: 'New Chat'),
      body: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _GroupChatTile(onTap: () => context.push('/chat/new/group')),
            const Divider(color: AppColors.border, height: 1),
            const SizedBox(height: 12),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: Text('FIND A TEAMMATE',
                  style: AppTextStyles.sectionLabel),
            ),
            const SizedBox(height: 10),
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
                        key: const Key('new-chat-search'),
                        controller: _searchController,
                        cursorColor: AppColors.accent,
                        style: AppTextStyles.monoSmall.copyWith(
                          color: AppColors.textPrimary,
                          fontSize: 13,
                        ),
                        decoration: InputDecoration(
                          hintText: 'Search by name or email…',
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
            const SizedBox(height: 16),
            if (_query.trim().isEmpty)
              Padding(
                padding:
                    const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
                child: Text(
                  'Start typing to find teammates in your organization.',
                  style: AppTextStyles.bodySmall
                      .copyWith(color: AppColors.textTertiary),
                ),
              )
            else if (!_searching && _results.isEmpty)
              Padding(
                padding:
                    const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
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
                    _ContactRow(
                      name: c.name,
                      email: c.email,
                      avatarUrl: c.avatarUrl,
                      onTap:
                          _creating ? null : () => _createDirect(c.email),
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
                  Text('OR ENTER AN ADDRESS',
                      style: AppTextStyles.sectionLabel),
                  const SizedBox(height: 10),
                  Container(
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
                          child: Icon(Icons.alternate_email,
                              size: 16, color: AppColors.textTertiary),
                        ),
                        Expanded(
                          child: TextField(
                            key: const Key('new-chat-email'),
                            controller: _emailController,
                            keyboardType: TextInputType.emailAddress,
                            cursorColor: AppColors.accent,
                            style: AppTextStyles.monoSmall.copyWith(
                              color: AppColors.textPrimary,
                              fontSize: 13,
                            ),
                            decoration: InputDecoration(
                              hintText: 'colleague@wistfare.com',
                              hintStyle: AppTextStyles.monoSmall.copyWith(
                                color: AppColors.textTertiary,
                                fontSize: 13,
                              ),
                              border: InputBorder.none,
                              isCollapsed: true,
                              contentPadding:
                                  const EdgeInsets.symmetric(vertical: 14),
                            ),
                            onSubmitted: (_) => _createDirect(),
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (_error != null) ...[
                    const SizedBox(height: 12),
                    Text(
                      _error!,
                      style: AppTextStyles.bodySmall
                          .copyWith(color: AppColors.danger),
                    ),
                  ],
                  const SizedBox(height: 16),
                  WmPrimaryButton(
                    key: const Key('new-chat-submit'),
                    label: _creating ? 'Creating…' : 'Start chat',
                    loading: _creating,
                    onPressed: _createDirect,
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

class _GroupChatTile extends StatelessWidget {
  const _GroupChatTile({required this.onTap});
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 18, 20, 18),
          child: Row(
            children: [
              Container(
                width: 36,
                height: 36,
                color: AppColors.accentDim,
                alignment: Alignment.center,
                child: const Icon(Icons.group_outlined,
                    color: AppColors.accent, size: 18),
              ),
              const SizedBox(width: 14),
              Text(
                'Create Group Chat',
                style: GoogleFonts.inter(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: AppColors.accent,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ContactRow extends StatelessWidget {
  const _ContactRow({
    required this.name,
    required this.email,
    required this.avatarUrl,
    required this.onTap,
  });
  final String name;
  final String email;
  final String? avatarUrl;
  final VoidCallback? onTap;

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
              WmAvatar(name: name, size: 36),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(name,
                        style: GoogleFonts.inter(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          color: AppColors.textPrimary,
                        )),
                    const SizedBox(height: 2),
                    Text(email, style: AppTextStyles.monoSmall),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
