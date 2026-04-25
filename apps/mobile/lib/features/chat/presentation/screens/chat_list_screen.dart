import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../providers/chat_providers.dart';
import '../widgets/conversation_list_item.dart';

/// Mobile/ChatList — design.lib.pen node `0o9r5`.
class ChatListScreen extends ConsumerWidget {
  const ChatListScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final chat = ref.watch(chatListControllerProvider);

    return Scaffold(
      backgroundColor: AppColors.background,
      body: Column(
        children: [
          _TopBar(onSearch: () {}, onNew: () => context.push('/chat/new')),
          Expanded(child: _Body(chat: chat)),
        ],
      ),
    );
  }
}

class _TopBar extends StatelessWidget {
  const _TopBar({required this.onSearch, required this.onNew});
  final VoidCallback onSearch;
  final VoidCallback onNew;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      bottom: false,
      child: Container(
        padding: const EdgeInsets.fromLTRB(20, 8, 8, 12),
        child: Row(
          children: [
            Text('Chat', style: AppTextStyles.titleLarge),
            const Spacer(),
            IconButton(
              splashRadius: 22,
              icon: const Icon(Icons.search, size: 22),
              color: AppColors.textSecondary,
              onPressed: onSearch,
            ),
            IconButton(
              splashRadius: 22,
              icon: const Icon(Icons.add, size: 22),
              color: AppColors.textSecondary,
              onPressed: onNew,
            ),
          ],
        ),
      ),
    );
  }
}

class _Body extends ConsumerWidget {
  const _Body({required this.chat});
  final ChatListState chat;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (chat.isLoading && !chat.hasLoaded) {
      return const _ChatListSkeleton();
    }

    if (chat.errorMessage != null && chat.conversations.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(
                Icons.error_outline,
                color: AppColors.danger,
                size: 36,
              ),
              const SizedBox(height: 12),
              Text(
                chat.errorMessage!,
                textAlign: TextAlign.center,
                style: AppTextStyles.bodySmall,
              ),
              const SizedBox(height: 12),
              TextButton(
                onPressed: () =>
                    ref.read(chatListControllerProvider.notifier).refresh(),
                child: const Text(
                  'Try again',
                  style: TextStyle(color: AppColors.accent),
                ),
              ),
            ],
          ),
        ),
      );
    }

    if (chat.conversations.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(
                Icons.chat_bubble_outline,
                color: AppColors.textTertiary,
                size: 40,
              ),
              const SizedBox(height: 16),
              Text('No conversations yet', style: AppTextStyles.titleMedium),
              const SizedBox(height: 6),
              Text(
                'Start one with the + button above.',
                style: AppTextStyles.bodySmall,
              ),
            ],
          ),
        ),
      );
    }

    return RefreshIndicator(
      color: AppColors.accent,
      backgroundColor: AppColors.surface,
      onRefresh: () => ref.read(chatListControllerProvider.notifier).refresh(),
      child: MediaQuery.removePadding(
        context: context,
        removeTop: true,
        child: ListView.separated(
          padding: EdgeInsets.zero,
          physics: const AlwaysScrollableScrollPhysics(),
          itemCount: chat.conversations.length,
          separatorBuilder: (context, index) =>
              const Divider(height: 1, color: AppColors.border),
          itemBuilder: (context, index) =>
              ConversationListItem(conversation: chat.conversations[index]),
        ),
      ),
    );
  }
}

class _ChatListSkeleton extends StatelessWidget {
  const _ChatListSkeleton();

  @override
  Widget build(BuildContext context) {
    return ListView.separated(
      padding: EdgeInsets.zero,
      physics: const NeverScrollableScrollPhysics(),
      itemCount: 8,
      separatorBuilder: (context, index) =>
          const Divider(height: 1, color: AppColors.border),
      itemBuilder: (context, i) {
        final titleWidth = 86 + (i * 17) % 70;
        final previewWidth = 190 + (i * 23) % 90;
        return Padding(
          padding: const EdgeInsets.fromLTRB(20, 14, 20, 14),
          child: Row(
            children: [
              const _SkeletonBar(width: 40, height: 40, radius: 20),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        _SkeletonBar(width: titleWidth.toDouble(), height: 14),
                        const Spacer(),
                        const _SkeletonBar(width: 24, height: 10),
                      ],
                    ),
                    const SizedBox(height: 8),
                    _SkeletonBar(width: previewWidth.toDouble(), height: 13),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _SkeletonBar extends StatelessWidget {
  const _SkeletonBar({
    required this.width,
    required this.height,
    this.radius = 2,
  });

  final double width;
  final double height;
  final double radius;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(radius),
      ),
    );
  }
}
