import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../../core/widgets/wm_avatar.dart';
import '../../../auth/presentation/providers/auth_controller.dart';
import '../../domain/conversation.dart';
import '../../domain/message.dart';
import '../providers/chat_providers.dart';

/// Mobile/ChatConversation — design.lib.pen node `nFsON`. Sharp message
/// bubbles (#1A1A1A incoming, #2A3A12 outgoing); send is a lime arrow
/// inside the input row.
class ChatConversationScreen extends ConsumerStatefulWidget {
  const ChatConversationScreen({super.key, required this.conversationId});

  final String conversationId;

  @override
  ConsumerState<ChatConversationScreen> createState() =>
      _ChatConversationScreenState();
}

class _ChatConversationScreenState
    extends ConsumerState<ChatConversationScreen> {
  final _inputController = TextEditingController();
  final _scrollController = ScrollController();

  @override
  void dispose() {
    _inputController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  Conversation? _findConversation() {
    final list = ref.read(chatListControllerProvider).conversations;
    for (final c in list) {
      if (c.id == widget.conversationId) return c;
    }
    return null;
  }

  Future<void> _send(String myUserId) async {
    final text = _inputController.text;
    final ok = await ref
        .read(conversationControllerProvider(widget.conversationId).notifier)
        .send(senderId: myUserId, content: text);
    if (ok) {
      _inputController.clear();
      _scrollToBottom();
    }
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scrollController.hasClients) return;
      _scrollController.animateTo(
        _scrollController.position.maxScrollExtent,
        duration: const Duration(milliseconds: 200),
        curve: Curves.easeOut,
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    final conversation = _findConversation();
    final state =
        ref.watch(conversationControllerProvider(widget.conversationId));
    final user = ref.watch(authControllerProvider).user;

    ref.listen(conversationControllerProvider(widget.conversationId),
        (prev, next) {
      if (next.messages.length != (prev?.messages.length ?? 0)) {
        _scrollToBottom();
      }
    });

    return Scaffold(
      backgroundColor: AppColors.background,
      body: Column(
        children: [
          _Header(conversation: conversation),
          Expanded(
            child: _Messages(
              state: state,
              myUserId: user?.id,
              scrollController: _scrollController,
            ),
          ),
          if (state.errorMessage != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 4),
              child: Text(
                state.errorMessage!,
                style:
                    AppTextStyles.bodySmall.copyWith(color: AppColors.danger),
              ),
            ),
          _Input(
            controller: _inputController,
            isSending: state.isSending,
            onSend: user == null ? null : () => _send(user.id),
          ),
        ],
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.conversation});
  final Conversation? conversation;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      bottom: false,
      child: Container(
        padding: const EdgeInsets.fromLTRB(8, 8, 8, 12),
        child: Row(
          children: [
            IconButton(
              splashRadius: 22,
              icon: const Icon(Icons.arrow_back, size: 22),
              color: AppColors.textSecondary,
              onPressed: () => Navigator.of(context).maybePop(),
            ),
            WmAvatar(
              name: conversation?.displayName ?? '?',
              size: 32,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    conversation?.displayName ?? 'Conversation',
                    style: AppTextStyles.titleMedium.copyWith(fontSize: 14),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  Text(
                    'Online',
                    style: GoogleFonts.jetBrainsMono(
                      fontSize: 11,
                      color: AppColors.accent,
                    ),
                  ),
                ],
              ),
            ),
            IconButton(
              splashRadius: 22,
              icon: const Icon(Icons.call_outlined, size: 20),
              color: AppColors.textSecondary,
              onPressed: () {},
            ),
            IconButton(
              splashRadius: 22,
              icon: const Icon(Icons.videocam_outlined, size: 20),
              color: AppColors.textSecondary,
              onPressed: () {},
            ),
          ],
        ),
      ),
    );
  }
}

class _Messages extends StatelessWidget {
  const _Messages({
    required this.state,
    required this.myUserId,
    required this.scrollController,
  });

  final ConversationState state;
  final String? myUserId;
  final ScrollController scrollController;

  @override
  Widget build(BuildContext context) {
    if (state.isLoading) {
      return const Center(
        child: SizedBox(
          width: 22,
          height: 22,
          child: CircularProgressIndicator(
              strokeWidth: 2, color: AppColors.accent),
        ),
      );
    }

    if (state.messages.isEmpty) {
      return Center(
        child: Text('Say hi — no messages yet.',
            style: AppTextStyles.bodySmall),
      );
    }

    return ListView.builder(
      controller: scrollController,
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
      itemCount: state.messages.length + 1,
      itemBuilder: (context, index) {
        if (index == 0) return const _DayHeader(label: 'Today');
        final message = state.messages[index - 1];
        final isMe = myUserId != null && message.senderId == myUserId;
        return _Bubble(message: message, isMe: isMe);
      },
    );
  }
}

class _DayHeader extends StatelessWidget {
  const _DayHeader({required this.label});
  final String label;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Center(
        child: Text(
          label,
          style: AppTextStyles.monoSmall.copyWith(color: AppColors.textTertiary),
        ),
      ),
    );
  }
}

class _Bubble extends StatelessWidget {
  const _Bubble({required this.message, required this.isMe});
  final Message message;
  final bool isMe;

  @override
  Widget build(BuildContext context) {
    final bubble = Container(
      constraints: BoxConstraints(
        maxWidth: MediaQuery.of(context).size.width * 0.72,
      ),
      margin: const EdgeInsets.only(bottom: 4),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      color: isMe ? AppColors.sentBubble : AppColors.receivedBubble,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            message.content,
            style: GoogleFonts.inter(
              fontSize: 13,
              color: AppColors.textPrimary,
              height: 1.4,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            message.timestamp,
            style: AppTextStyles.monoSmall.copyWith(
              fontSize: 10,
              color: AppColors.textTertiary,
            ),
          ),
        ],
      ),
    );

    if (isMe) {
      return Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: Align(alignment: Alignment.centerRight, child: bubble),
      );
    }
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          WmAvatar(
            name: message.senderId,
            size: 24,
            color: AppColors.avatarBlue,
          ),
          const SizedBox(width: 8),
          bubble,
        ],
      ),
    );
  }
}

class _Input extends StatelessWidget {
  const _Input({
    required this.controller,
    required this.isSending,
    required this.onSend,
  });
  final TextEditingController controller;
  final bool isSending;
  final VoidCallback? onSend;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: AppColors.background,
        border: Border(top: BorderSide(color: AppColors.border)),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      child: SafeArea(
        top: false,
        child: Row(
          children: [
            IconButton(
              splashRadius: 22,
              icon: const Icon(Icons.add, size: 22),
              color: AppColors.textTertiary,
              onPressed: () {},
            ),
            Expanded(
              child: Container(
                padding: const EdgeInsets.symmetric(
                    horizontal: 14, vertical: 10),
                color: AppColors.surface,
                child: TextField(
                  controller: controller,
                  minLines: 1,
                  maxLines: 5,
                  cursorColor: AppColors.accent,
                  style: GoogleFonts.inter(
                    fontSize: 13,
                    color: AppColors.textPrimary,
                  ),
                  decoration: InputDecoration(
                    border: InputBorder.none,
                    enabledBorder: InputBorder.none,
                    focusedBorder: InputBorder.none,
                    hintText: 'Type a message...',
                    hintStyle: GoogleFonts.inter(
                      fontSize: 13,
                      color: AppColors.textTertiary,
                    ),
                    isDense: true,
                    contentPadding: EdgeInsets.zero,
                    filled: false,
                  ),
                ),
              ),
            ),
            const SizedBox(width: 8),
            GestureDetector(
              onTap: isSending ? null : onSend,
              child: Container(
                width: 40,
                height: 40,
                color: isSending ? AppColors.surface : AppColors.accent,
                alignment: Alignment.center,
                child: Icon(
                  Icons.arrow_upward,
                  color: isSending
                      ? AppColors.textTertiary
                      : AppColors.background,
                  size: 18,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
