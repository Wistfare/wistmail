import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../../core/widgets/wm_avatar.dart';
import '../../../auth/presentation/providers/auth_controller.dart';
import '../../domain/contact.dart';
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

  Future<void> _pickAttachment() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.any,
      withData: true,
      allowMultiple: false,
    );
    if (result == null || result.files.isEmpty) return;
    final file = result.files.single;
    final bytes = file.bytes;
    if (bytes == null) {
      // On some platforms FilePicker streams from disk via path
      // instead of memory. We could read the file with dart:io, but
      // adding a path fallback here would tug in additional deps; for
      // now show a friendly error so the user knows what happened.
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Could not read file bytes')),
      );
      return;
    }
    await ref
        .read(conversationControllerProvider(widget.conversationId).notifier)
        .uploadAndStageAttachment(
          bytes: bytes,
          filename: file.name,
          contentType: _guessContentType(file.name),
        );
  }

  String _guessContentType(String filename) {
    final ext = filename.split('.').last.toLowerCase();
    const map = <String, String>{
      'png': 'image/png',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'gif': 'image/gif',
      'webp': 'image/webp',
      'pdf': 'application/pdf',
      'txt': 'text/plain',
      'mp4': 'video/mp4',
      'mov': 'video/quicktime',
    };
    return map[ext] ?? 'application/octet-stream';
  }

  void _openMembersSheet(
    BuildContext context, {
    required Conversation conversation,
    required String? myUserId,
  }) {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: AppColors.background,
      isScrollControlled: true,
      builder: (sheetContext) => _MembersSheet(
        conversationId: conversation.id,
        conversationTitle: conversation.title ?? 'Group',
        myUserId: myUserId,
      ),
    );
  }

  Future<void> _showEditDialog(Message message, String? myUserId) async {
    if (myUserId == null) return;
    final controller = TextEditingController(text: message.content);
    final result = await showDialog<String>(
      context: context,
      builder: (dialogCtx) => AlertDialog(
        backgroundColor: AppColors.surface,
        title: const Text('Edit message'),
        content: TextField(
          controller: controller,
          autofocus: true,
          maxLines: 5,
          minLines: 1,
          cursorColor: AppColors.accent,
          decoration: const InputDecoration(border: OutlineInputBorder()),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogCtx),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () =>
                Navigator.pop(dialogCtx, controller.text.trim()),
            child: const Text('Save',
                style: TextStyle(color: AppColors.accent)),
          ),
        ],
      ),
    );
    controller.dispose();
    if (result == null || result.isEmpty || result == message.content) return;
    await ref
        .read(conversationControllerProvider(widget.conversationId).notifier)
        .editMessage(
          messageId: message.id,
          senderId: myUserId,
          content: result,
        );
  }

  Future<void> _confirmDelete(Message message) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (dialogCtx) => AlertDialog(
        backgroundColor: AppColors.surface,
        title: const Text('Delete message?'),
        content: const Text("This can't be undone."),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogCtx, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(dialogCtx, true),
            child: const Text('Delete',
                style: TextStyle(color: AppColors.danger)),
          ),
        ],
      ),
    );
    if (ok != true) return;
    await ref
        .read(conversationControllerProvider(widget.conversationId).notifier)
        .deleteMessage(message.id);
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
          _Header(
            conversation: conversation,
            onTapTitle: conversation?.kind == 'group'
                ? () => _openMembersSheet(
                      context,
                      conversation: conversation!,
                      myUserId: user?.id,
                    )
                : null,
          ),
          Expanded(
            child: _Messages(
              state: state,
              myUserId: user?.id,
              conversation: conversation,
              scrollController: _scrollController,
              onEdit: (Message m) => _showEditDialog(m, user?.id),
              onDelete: (Message m) => _confirmDelete(m),
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
          if (state.typers.isNotEmpty)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 4),
              child: Text(
                _typingLabel(state.typers.map((t) => t.typerName).toList()),
                style: AppTextStyles.monoSmall.copyWith(
                  color: AppColors.textTertiary,
                ),
              ),
            ),
          if (state.pendingAttachments.isNotEmpty)
            _PendingAttachments(
              attachments: state.pendingAttachments,
              onRemove: (id) => ref
                  .read(conversationControllerProvider(widget.conversationId)
                      .notifier)
                  .removePendingAttachment(id),
            ),
          _Input(
            controller: _inputController,
            isSending: state.isSending,
            isUploading: state.isUploading,
            onSend: user == null ? null : () => _send(user.id),
            onAttach: _pickAttachment,
            onTextChanged: () => ref
                .read(conversationControllerProvider(widget.conversationId)
                    .notifier)
                .notifyTyping(),
          ),
        ],
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.conversation, this.onTapTitle});
  final Conversation? conversation;
  final VoidCallback? onTapTitle;

  @override
  Widget build(BuildContext context) {
    final isGroup = conversation?.kind == 'group';
    final memberCount = (conversation?.otherParticipants.length ?? 0) + 1;
    final subtitle = isGroup ? '$memberCount members' : 'Online';

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
            if (isGroup)
              Container(
                width: 32,
                height: 32,
                color: AppColors.accentDim,
                alignment: Alignment.center,
                child: const Icon(Icons.group_outlined,
                    size: 16, color: AppColors.accent),
              )
            else
              WmAvatar(
                name: conversation?.displayName ?? '?',
                size: 32,
              ),
            const SizedBox(width: 10),
            Expanded(
              child: InkWell(
                onTap: onTapTitle,
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
                      subtitle,
                      style: GoogleFonts.jetBrainsMono(
                        fontSize: 11,
                        color: isGroup
                            ? AppColors.textTertiary
                            : AppColors.accent,
                      ),
                    ),
                  ],
                ),
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
    required this.conversation,
    required this.scrollController,
    required this.onEdit,
    required this.onDelete,
  });

  final ConversationState state;
  final String? myUserId;
  final Conversation? conversation;
  final ScrollController scrollController;
  final void Function(Message) onEdit;
  final void Function(Message) onDelete;

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

    final isGroup = conversation?.kind == 'group';
    final byUser = <String, Participant>{
      for (final p in conversation?.otherParticipants ?? const <Participant>[])
        p.id: p,
    };

    // Bucket per-message reads (excluding the current user — no
    // "seen by you" chip on your own message). Hydrate names + avatar
    // colour data from the conversation's other-participants list so
    // the row renders without an extra fetch.
    final readsByMessage = <String, List<_ReadByEntry>>{};
    for (final r in state.reads) {
      if (r.userId == myUserId) continue;
      final p = byUser[r.userId];
      readsByMessage.putIfAbsent(r.messageId, () => []).add(
            _ReadByEntry(
              userId: r.userId,
              name: p?.name ?? 'Member',
            ),
          );
    }

    // Find the most recent self-sent, not-deleted message — that's the
    // only one we render the seen-by row under.
    int lastMineIdx = -1;
    for (int i = state.messages.length - 1; i >= 0; i--) {
      final m = state.messages[i];
      if (m.senderId == myUserId && !m.isDeleted) {
        lastMineIdx = i;
        break;
      }
    }

    return ListView.builder(
      controller: scrollController,
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
      itemCount: state.messages.length + 1,
      itemBuilder: (context, index) {
        if (index == 0) return const _DayHeader(label: 'Today');
        final messageIdx = index - 1;
        final message = state.messages[messageIdx];
        final isMe = myUserId != null && message.senderId == myUserId;
        final sender = byUser[message.senderId];
        return _Bubble(
          message: message,
          isMe: isMe,
          isGroup: isGroup,
          senderName: sender?.name,
          showReadAvatars: messageIdx == lastMineIdx,
          readBy: readsByMessage[message.id] ?? const [],
          onEdit: () => onEdit(message),
          onDelete: () => onDelete(message),
        );
      },
    );
  }
}

class _ReadByEntry {
  const _ReadByEntry({required this.userId, required this.name});
  final String userId;
  final String name;
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
  const _Bubble({
    required this.message,
    required this.isMe,
    required this.isGroup,
    required this.senderName,
    required this.showReadAvatars,
    required this.readBy,
    required this.onEdit,
    required this.onDelete,
  });
  final Message message;
  final bool isMe;
  final bool isGroup;
  final String? senderName;
  final bool showReadAvatars;
  final List<_ReadByEntry> readBy;
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final isDeleted = message.isDeleted;
    final isEdited = message.isEdited;

    final bodyText = isDeleted ? 'Message deleted' : message.content;
    final bodyStyle = isDeleted
        ? GoogleFonts.inter(
            fontSize: 13,
            color: AppColors.textTertiary,
            height: 1.4,
            fontStyle: FontStyle.italic,
          )
        : GoogleFonts.inter(
            fontSize: 13,
            color: AppColors.textPrimary,
            height: 1.4,
          );

    final bubble = Container(
      constraints: BoxConstraints(
        maxWidth: MediaQuery.of(context).size.width * 0.72,
      ),
      margin: const EdgeInsets.only(bottom: 4),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      color: isDeleted
          ? AppColors.surface
          : (isMe ? AppColors.sentBubble : AppColors.receivedBubble),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (isGroup && !isMe && !isDeleted && senderName != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: Text(
                senderName!,
                style: GoogleFonts.inter(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  color: AppColors.accent,
                ),
              ),
            ),
          if (bodyText.isNotEmpty || isDeleted)
            Text(bodyText, style: bodyStyle),
          if (!isDeleted && message.attachments.isNotEmpty) ...[
            if (bodyText.isNotEmpty) const SizedBox(height: 8),
            _AttachmentList(
              conversationId: message.conversationId,
              attachments: message.attachments,
            ),
          ],
          const SizedBox(height: 4),
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                message.timestamp,
                style: AppTextStyles.monoSmall.copyWith(
                  fontSize: 10,
                  color: AppColors.textTertiary,
                ),
              ),
              if (isEdited) ...[
                const SizedBox(width: 6),
                Text(
                  'edited',
                  style: AppTextStyles.monoSmall.copyWith(
                    fontSize: 10,
                    color: AppColors.textTertiary,
                  ),
                ),
              ],
            ],
          ),
        ],
      ),
    );

    // Long-press opens the action sheet on the user's own bubbles.
    final tappableBubble = (isMe && !isDeleted)
        ? GestureDetector(
            behavior: HitTestBehavior.opaque,
            onLongPress: () => _showActionSheet(context),
            child: bubble,
          )
        : bubble;

    if (isMe) {
      return Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            tappableBubble,
            if (showReadAvatars && readBy.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 2, right: 2),
                child: _SeenByRow(readers: readBy),
              ),
          ],
        ),
      );
    }
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          WmAvatar(
            name: senderName ?? message.senderId,
            size: 24,
            color: AppColors.avatarBlue,
          ),
          const SizedBox(width: 8),
          tappableBubble,
        ],
      ),
    );
  }

  void _showActionSheet(BuildContext context) {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: AppColors.background,
      builder: (sheetCtx) => SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.edit_outlined,
                  color: AppColors.textPrimary),
              title: const Text('Edit'),
              onTap: () {
                Navigator.pop(sheetCtx);
                onEdit();
              },
            ),
            ListTile(
              leading:
                  const Icon(Icons.delete_outline, color: AppColors.danger),
              title: const Text('Delete',
                  style: TextStyle(color: AppColors.danger)),
              onTap: () {
                Navigator.pop(sheetCtx);
                onDelete();
              },
            ),
          ],
        ),
      ),
    );
  }
}

/// Compact "Seen by" avatar row rendered under the most recent
/// self-sent message. Caps at the first 3 readers + a "+N" overflow
/// chip so a big group's read state doesn't blow out the layout.
class _SeenByRow extends StatelessWidget {
  const _SeenByRow({required this.readers});
  final List<_ReadByEntry> readers;

  @override
  Widget build(BuildContext context) {
    final visible = readers.take(3).toList();
    final overflow = readers.length - visible.length;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          'Seen by ',
          style: AppTextStyles.monoSmall.copyWith(
            fontSize: 9,
            color: AppColors.textTertiary,
          ),
        ),
        for (var i = 0; i < visible.length; i++)
          Padding(
            padding: EdgeInsets.only(left: i == 0 ? 0 : 2),
            child: WmAvatar(
              name: visible[i].name,
              size: 16,
              color: AppColors.avatarBlue,
            ),
          ),
        if (overflow > 0)
          Padding(
            padding: const EdgeInsets.only(left: 4),
            child: Text(
              '+$overflow',
              style: AppTextStyles.monoSmall.copyWith(
                fontSize: 9,
                color: AppColors.textTertiary,
              ),
            ),
          ),
      ],
    );
  }
}

class _Input extends StatelessWidget {
  const _Input({
    required this.controller,
    required this.isSending,
    required this.onSend,
    this.isUploading = false,
    this.onAttach,
    this.onTextChanged,
  });
  final TextEditingController controller;
  final bool isSending;
  final bool isUploading;
  final VoidCallback? onSend;
  final VoidCallback? onAttach;
  final VoidCallback? onTextChanged;

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
              icon: isUploading
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: AppColors.accent,
                      ),
                    )
                  : const Icon(Icons.attach_file, size: 22),
              color: AppColors.textTertiary,
              onPressed: isUploading ? null : onAttach,
              tooltip: 'Attach file',
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
                  onChanged: (_) => onTextChanged?.call(),
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

/// Bottom-sheet member panel for a group conversation. Lazily loads
/// the full participant list (separate query so we don't widen the
/// summary endpoint for screens that don't need it). Self-leave
/// always permitted; the API enforces the creator-only rule for
/// removing other members and surfaces a 403 if violated.
class _MembersSheet extends ConsumerStatefulWidget {
  const _MembersSheet({
    required this.conversationId,
    required this.conversationTitle,
    required this.myUserId,
  });
  final String conversationId;
  final String conversationTitle;
  final String? myUserId;

  @override
  ConsumerState<_MembersSheet> createState() => _MembersSheetState();
}

class _MembersSheetState extends ConsumerState<_MembersSheet> {
  Future<List<Contact>>? _future;
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<List<Contact>> _load() async {
    final repo = await ref.read(chatRepositoryProvider.future);
    return repo.listParticipants(widget.conversationId);
  }

  void _refresh() {
    setState(() => _future = _load());
  }

  Future<void> _remove(Contact c) async {
    final isSelf = c.id == widget.myUserId;
    final messenger = ScaffoldMessenger.of(context);
    final navigator = Navigator.of(context);
    if (isSelf) {
      final confirmed = await showDialog<bool>(
        context: context,
        builder: (dialogCtx) => AlertDialog(
          backgroundColor: AppColors.surface,
          title: Text('Leave "${widget.conversationTitle}"?'),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogCtx, false),
              child: const Text('Cancel'),
            ),
            TextButton(
              onPressed: () => Navigator.pop(dialogCtx, true),
              child: const Text('Leave',
                  style: TextStyle(color: AppColors.danger)),
            ),
          ],
        ),
      );
      if (confirmed != true) return;
    }

    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final repo = await ref.read(chatRepositoryProvider.future);
      await repo.removeParticipant(
        conversationId: widget.conversationId,
        userId: c.id,
      );
      ref.invalidate(chatListControllerProvider);
      if (!mounted) return;
      if (isSelf) {
        navigator.pop();
        if (navigator.canPop()) navigator.pop();
        context.go('/chat');
      } else {
        _refresh();
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = e.toString();
      });
      messenger.showSnackBar(SnackBar(content: Text('Could not remove: $e')));
    } finally {
      if (mounted && !isSelf) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      initialChildSize: 0.55,
      minChildSize: 0.3,
      maxChildSize: 0.9,
      expand: false,
      builder: (context, controller) {
        return Container(
          decoration: const BoxDecoration(
            color: AppColors.background,
            border: Border(top: BorderSide(color: AppColors.border)),
          ),
          child: Column(
            children: [
              const SizedBox(height: 8),
              Container(
                width: 36,
                height: 3,
                color: AppColors.border,
              ),
              const SizedBox(height: 10),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: Row(
                  children: [
                    const Icon(Icons.group_outlined,
                        size: 18, color: AppColors.accent),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        widget.conversationTitle,
                        style: AppTextStyles.titleMedium
                            .copyWith(fontSize: 14),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    IconButton(
                      splashRadius: 20,
                      icon: const Icon(Icons.refresh, size: 18),
                      color: AppColors.textTertiary,
                      onPressed: _busy ? null : _refresh,
                    ),
                  ],
                ),
              ),
              const Divider(color: AppColors.border, height: 16),
              Expanded(
                child: FutureBuilder<List<Contact>>(
                  future: _future,
                  builder: (context, snap) {
                    if (snap.connectionState != ConnectionState.done) {
                      return const Center(
                        child: SizedBox(
                          width: 22,
                          height: 22,
                          child: CircularProgressIndicator(
                              strokeWidth: 2, color: AppColors.accent),
                        ),
                      );
                    }
                    if (snap.hasError) {
                      return Padding(
                        padding: const EdgeInsets.all(20),
                        child: Text(
                          'Could not load members.',
                          style: AppTextStyles.bodySmall
                              .copyWith(color: AppColors.danger),
                        ),
                      );
                    }
                    final members = snap.data ?? const <Contact>[];
                    return ListView.separated(
                      controller: controller,
                      padding: EdgeInsets.zero,
                      itemCount: members.length,
                      separatorBuilder: (context, index) =>
                          const Divider(color: AppColors.border, height: 1),
                      itemBuilder: (context, index) {
                        final m = members[index];
                        final isSelf = m.id == widget.myUserId;
                        return ListTile(
                          dense: true,
                          leading: WmAvatar(name: m.name, size: 32),
                          title: Text(
                            isSelf ? '${m.name} (you)' : m.name,
                            style: GoogleFonts.inter(
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                              color: AppColors.textPrimary,
                            ),
                          ),
                          subtitle: Text(m.email,
                              style: AppTextStyles.monoSmall),
                          trailing: IconButton(
                            splashRadius: 20,
                            icon: Icon(
                              isSelf ? Icons.logout : Icons.close,
                              size: 18,
                              color: AppColors.textTertiary,
                            ),
                            onPressed: _busy ? null : () => _remove(m),
                          ),
                        );
                      },
                    );
                  },
                ),
              ),
              if (_error != null)
                Padding(
                  padding:
                      const EdgeInsets.fromLTRB(20, 4, 20, 12),
                  child: Text(
                    _error!,
                    style: AppTextStyles.bodySmall
                        .copyWith(color: AppColors.danger),
                  ),
                ),
            ],
          ),
        );
      },
    );
  }
}

/// Composer-strip preview of staged-but-not-yet-sent attachments.
/// Each chip is removable; tapping the X drops it from the pending
/// list locally (the orphan cleanup job will GC the bytes server-
/// side after 24h).
class _PendingAttachments extends StatelessWidget {
  const _PendingAttachments({
    required this.attachments,
    required this.onRemove,
  });
  final List<MessageAttachment> attachments;
  final void Function(String id) onRemove;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 4, 12, 4),
      child: Wrap(
        spacing: 6,
        runSpacing: 6,
        children: [
          for (final a in attachments)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: AppColors.surface,
                border: Border.all(color: AppColors.border),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    a.isImage
                        ? Icons.image_outlined
                        : Icons.insert_drive_file_outlined,
                    size: 14,
                    color: AppColors.textTertiary,
                  ),
                  const SizedBox(width: 6),
                  ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 140),
                    child: Text(
                      a.filename,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppTextStyles.monoSmall.copyWith(
                        fontSize: 11,
                        color: AppColors.textSecondary,
                      ),
                    ),
                  ),
                  const SizedBox(width: 6),
                  GestureDetector(
                    onTap: () => onRemove(a.id),
                    child: const Icon(
                      Icons.close,
                      size: 14,
                      color: AppColors.textTertiary,
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _AttachmentList extends ConsumerWidget {
  const _AttachmentList({
    required this.conversationId,
    required this.attachments,
  });
  final String conversationId;
  final List<MessageAttachment> attachments;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        for (final att in attachments)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Material(
              color: Colors.transparent,
              child: InkWell(
                onTap: () async {
                  final repo =
                      await ref.read(chatRepositoryProvider.future);
                  final url = repo.attachmentUrl(
                    conversationId: conversationId,
                    attachmentId: att.id,
                  );
                  await launchUrl(
                    Uri.parse(url),
                    mode: LaunchMode.externalApplication,
                  );
                },
                child: Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 10, vertical: 8),
                  decoration: BoxDecoration(
                    color: AppColors.surface,
                    border: Border.all(color: AppColors.border),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        att.isImage
                            ? Icons.image_outlined
                            : Icons.insert_drive_file_outlined,
                        size: 16,
                        color: AppColors.textTertiary,
                      ),
                      const SizedBox(width: 8),
                      ConstrainedBox(
                        constraints: const BoxConstraints(maxWidth: 180),
                        child: Text(
                          att.filename,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: GoogleFonts.inter(
                            fontSize: 12,
                            fontWeight: FontWeight.w500,
                            color: AppColors.textPrimary,
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Text(
                        _formatBytes(att.sizeBytes),
                        style: AppTextStyles.monoSmall.copyWith(
                          fontSize: 10,
                          color: AppColors.textTertiary,
                        ),
                      ),
                      const SizedBox(width: 6),
                      const Icon(Icons.download_outlined,
                          size: 14, color: AppColors.textTertiary),
                    ],
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }
}

String _formatBytes(int n) {
  if (n < 1024) return '$n B';
  if (n < 1024 * 1024) return '${(n / 1024).round()} KB';
  return '${(n / (1024 * 1024)).toStringAsFixed(1)} MB';
}

/// "Alice is typing…" / "Alice and Bob are typing…" / "Alice and N
/// others are typing…". Cap names so the label stays compact in big
/// groups.
String _typingLabel(List<String> names) {
  if (names.isEmpty) return '';
  if (names.length == 1) return '${names.first} is typing…';
  if (names.length == 2) return '${names[0]} and ${names[1]} are typing…';
  return '${names.first} and ${names.length - 1} others are typing…';
}
