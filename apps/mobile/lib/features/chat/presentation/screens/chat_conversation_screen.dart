import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../auth/presentation/providers/auth_controller.dart';
import '../../domain/conversation.dart';
import '../../domain/message.dart';
import '../providers/chat_providers.dart';

class ChatConversationScreen extends ConsumerStatefulWidget {
  const ChatConversationScreen({super.key, required this.conversationId});

  final String conversationId;

  @override
  ConsumerState<ChatConversationScreen> createState() => _ChatConversationScreenState();
}

class _ChatConversationScreenState extends ConsumerState<ChatConversationScreen> {
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
    final state = ref.watch(conversationControllerProvider(widget.conversationId));
    final user = ref.watch(authControllerProvider).user;

    ref.listen(conversationControllerProvider(widget.conversationId), (prev, next) {
      if (next.messages.length != (prev?.messages.length ?? 0)) {
        _scrollToBottom();
      }
    });

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.background,
        automaticallyImplyLeading: false,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: AppColors.textPrimary),
          onPressed: () => context.pop(),
        ),
        titleSpacing: 0,
        title: Row(
          children: [
            Container(
              width: 34,
              height: 34,
              decoration: BoxDecoration(
                color: conversation?.avatarColor ?? AppColors.textTertiary,
                shape: BoxShape.circle,
              ),
              child: Center(
                child: Text(
                  conversation?.displayInitials ?? '?',
                  style: GoogleFonts.inter(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: Colors.white,
                  ),
                ),
              ),
            ),
            const SizedBox(width: 10),
            Text(
              conversation?.displayName ?? 'Conversation',
              style: GoogleFonts.inter(
                fontSize: 15,
                fontWeight: FontWeight.w600,
                color: AppColors.textPrimary,
              ),
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.call_outlined, color: AppColors.textSecondary),
            onPressed: () {},
          ),
          IconButton(
            icon: const Icon(Icons.videocam_outlined, color: AppColors.textSecondary),
            onPressed: () {},
          ),
        ],
      ),
      body: Column(
        children: [
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
                style: GoogleFonts.inter(fontSize: 12, color: AppColors.badgeRed),
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
          width: 24,
          height: 24,
          child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.accent),
        ),
      );
    }

    if (state.messages.isEmpty) {
      return Center(
        child: Text(
          'Say hi — no messages yet.',
          style: GoogleFonts.inter(fontSize: 13, color: AppColors.textSecondary),
        ),
      );
    }

    return ListView.builder(
      controller: scrollController,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      itemCount: state.messages.length,
      itemBuilder: (context, index) {
        final message = state.messages[index];
        return _Bubble(message: message, isMe: myUserId != null && message.senderId == myUserId);
      },
    );
  }
}

class _Bubble extends StatelessWidget {
  const _Bubble({required this.message, required this.isMe});
  final Message message;
  final bool isMe;

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: isMe ? Alignment.centerRight : Alignment.centerLeft,
      child: Column(
        crossAxisAlignment: isMe ? CrossAxisAlignment.end : CrossAxisAlignment.start,
        children: [
          Container(
            constraints: BoxConstraints(
              maxWidth: MediaQuery.of(context).size.width * 0.72,
            ),
            margin: const EdgeInsets.only(bottom: 4),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: BoxDecoration(
              color: isMe ? AppColors.sentBubble : AppColors.receivedBubble,
              borderRadius: BorderRadius.only(
                topLeft: const Radius.circular(16),
                topRight: const Radius.circular(16),
                bottomLeft: Radius.circular(isMe ? 16 : 4),
                bottomRight: Radius.circular(isMe ? 4 : 16),
              ),
            ),
            child: Text(
              message.content,
              style: GoogleFonts.inter(
                fontSize: 14,
                color: AppColors.textPrimary,
                height: 1.4,
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Text(
              message.timestamp,
              style: GoogleFonts.inter(fontSize: 11, color: AppColors.textSecondary),
            ),
          ),
        ],
      ),
    );
  }
}

class _Input extends StatelessWidget {
  const _Input({required this.controller, required this.isSending, required this.onSend});
  final TextEditingController controller;
  final bool isSending;
  final VoidCallback? onSend;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        border: Border(top: BorderSide(color: AppColors.border)),
        color: AppColors.background,
      ),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      child: SafeArea(
        top: false,
        child: Row(
          children: [
            IconButton(
              icon: const Icon(Icons.add, color: AppColors.textSecondary),
              onPressed: () {},
            ),
            Expanded(
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                decoration: BoxDecoration(
                  color: AppColors.surface,
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: AppColors.border),
                ),
                child: TextField(
                  controller: controller,
                  minLines: 1,
                  maxLines: 5,
                  style: GoogleFonts.inter(fontSize: 14, color: AppColors.textPrimary),
                  textInputAction: TextInputAction.newline,
                  decoration: InputDecoration(
                    border: InputBorder.none,
                    enabledBorder: InputBorder.none,
                    focusedBorder: InputBorder.none,
                    hintText: 'Type a message…',
                    hintStyle: GoogleFonts.inter(
                      fontSize: 14,
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
                decoration: BoxDecoration(
                  color: isSending ? AppColors.surface : AppColors.accent,
                  shape: BoxShape.circle,
                ),
                child: Icon(
                  Icons.send_rounded,
                  color: isSending ? AppColors.textTertiary : AppColors.background,
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
