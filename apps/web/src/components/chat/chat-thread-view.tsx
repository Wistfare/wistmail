'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Check,
  Download,
  File as FileIcon,
  Loader2,
  LogOut,
  MessageSquare,
  Mic,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Phone,
  Plus,
  Search,
  Send,
  Smile,
  Sparkles,
  Trash2,
  Users,
  Video,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Avatar } from '@/components/ui/avatar'
import { MessageStackSkeleton } from './chat-skeletons'
import {
  chatAttachmentUrl,
  useAddParticipants,
  useContactSearch,
  useConversationReads,
  useConversations,
  useDeleteMessage,
  useEditMessage,
  useMarkConversationRead,
  useMessages,
  useNotifyTyping,
  useParticipants,
  useRemoveParticipant,
  useSendMessage,
  useUploadAttachment,
  type ChatAttachment,
  type ChatMessage,
  type ContactSearchResult,
  type ConversationReadEntry,
  type ConversationSummary,
} from '@/lib/chat-queries'
import { useSessionUser } from '@/lib/session-user-context'
import { useTypers } from '@/lib/typing-bus'

/// Chat thread view for a single conversation.
///
/// Used by:
///  - `app/(app)/inbox/page.tsx` — rendered inline in the right reading
///    pane when a chat row is selected. Receives `onBack` so the X-style
///    back affordance clears the selection instead of navigating.
///  - `app/(app)/chat/[id]/page.tsx` — thin route wrapper that just
///    forwards `params.id` here. Without `onBack` we route to /inbox.
///
/// Reads the conversation summary from the cached `useConversations()`
/// list to render the header without an extra fetch.  Messages fan in
/// via `useMessages`, send is optimistic-light (the server returns
/// id+createdAt and the post-success invalidate refreshes the cache;
/// realtime takes care of multi-device sync).  Group threads also
/// render a member panel with add/remove affordances.
export interface ChatThreadViewProps {
  conversationId: string
  /// Optional override for the back-arrow button.  When provided
  /// (inbox embedding) the arrow fires this; otherwise it routes back
  /// to /inbox.
  onBack?: () => void
}

export function ChatThreadView({ conversationId, onBack }: ChatThreadViewProps) {
  const router = useRouter()
  const sessionUser = useSessionUser()
  const conversationsQ = useConversations()
  const messagesQ = useMessages(conversationId)
  const readsQ = useConversationReads(conversationId)
  const send = useSendMessage(conversationId)
  const editMessage = useEditMessage(conversationId)
  const deleteMessage = useDeleteMessage(conversationId)
  const markRead = useMarkConversationRead()
  const notifyTyping = useNotifyTyping()
  const typers = useTypers(conversationId).filter(
    (t) => t.typerId !== sessionUser.id,
  )

  const [draft, setDraft] = useState('')
  const [showMembers, setShowMembers] = useState(false)
  const [pending, setPending] = useState<ChatAttachment[]>([])
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const upload = useUploadAttachment()
  const scrollRef = useRef<HTMLDivElement | null>(null)
  // Debounce typing pings: fire at most once every 3s while keystrokes
  // flow. The receiver TTL is 5s so we always have a buffer if a
  // single ping fails.
  const lastTypingSentRef = useRef<number>(0)

  const conversation: ConversationSummary | undefined = useMemo(
    () => conversationsQ.data?.find((c) => c.id === conversationId),
    [conversationsQ.data, conversationId],
  )
  const isGroup = conversation?.kind === 'group'

  // Mark as read when the thread opens or whenever a new message
  // arrives while the user is looking at it.
  useEffect(() => {
    if (!conversation) return
    if (conversation.unreadCount > 0) {
      markRead.mutate(conversationId)
    }
    // We only depend on the count + id so we don't refire while
    // typing or on every cache tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation?.unreadCount, conversationId])

  // Autoscroll to the latest message on load and on new arrivals.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messagesQ.data?.length])

  async function handleSend() {
    const content = draft.trim()
    if ((!content && pending.length === 0) || send.isPending) return
    const attachmentIds = pending.map((a) => a.id)
    setDraft('')
    setPending([])
    try {
      await send.mutateAsync({ content, attachmentIds })
    } catch {
      // Restore so the user can retry without re-typing or re-uploading.
      setDraft(content)
      setPending(pending)
    }
  }

  async function handlePickFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setUploadError(null)
    for (const file of Array.from(files)) {
      try {
        const att = await upload.mutateAsync(file)
        setPending((prev) => [...prev, att])
      } catch (err) {
        setUploadError(
          err instanceof Error ? err.message : 'Upload failed.',
        )
      }
    }
    // Reset the input so picking the same file again still triggers onChange.
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function removePending(id: string) {
    setPending((prev) => prev.filter((a) => a.id !== id))
  }

  const other = conversation?.otherParticipants[0]
  const displayName =
    conversation?.title ?? other?.name ?? other?.email ?? 'Chat'
  /// Pencil chS (presence row) splits into two slots:
  ///   - active: lime dot + "ACTIVE NOW" 9/700 lime tracking 1.5
  ///   - role  : "·" separator + role/handle 9/500 #6e6e6e tracking 0.5
  /// We show the active slot when the conversation has any unread
  /// activity in the last few minutes (typing or recent message);
  /// the role slot reads from the participant's email handle.
  const isActive = (typers && typers.length > 0) ? false : false // placeholder — TODO: wire real presence
  const role = isGroup
    ? `${(conversation?.otherParticipants.length ?? 0) + 1} members`
    : (other?.email ?? '')

  return (
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Pencil cHd (`U41as`): padding [14, 24], 1px bottom #1A1A1A,
            justify between.  Inbox-embedded use mounts a leading
            back-arrow before cHL so the user has a one-click way to
            clear the inline selection; standalone /chat/[id] use
            keeps the same affordance but routes back to /inbox. */}
        <header
          className="flex w-full items-center justify-between"
          style={{
            padding: '14px 24px',
            borderBottom: '1px solid var(--color-wm-border)',
          }}
        >
          <div className="flex min-w-0 items-center" style={{ gap: 12 }}>
            <button
              type="button"
              onClick={() => (onBack ? onBack() : router.push('/inbox'))}
              className="flex shrink-0 cursor-pointer items-center justify-center text-wm-text-muted transition-colors hover:text-wm-text-primary"
              aria-label="Back to inbox"
              style={{ width: 24, height: 24 }}
            >
              <ArrowLeft style={{ width: 14, height: 14 }} />
            </button>
            {isGroup ? (
              <span
                aria-hidden
                className="flex shrink-0 items-center justify-center rounded-full text-white"
                style={{ width: 40, height: 40, background: '#6D4AD4' }}
              >
                <Users style={{ width: 18, height: 18 }} />
              </span>
            ) : (
              <Avatar name={displayName} src={other?.avatarUrl} size="md" />
            )}
            <div className="flex min-w-0 flex-col" style={{ gap: 1 }}>
              <h2
                className="truncate font-mono font-bold text-wm-text-primary"
                style={{ fontSize: 14 }}
              >
                {displayName}
              </h2>
              <div
                className="flex min-w-0 items-center"
                style={{ gap: 6 }}
              >
                {isActive && (
                  <>
                    <span
                      aria-hidden
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: 999,
                        background: 'var(--color-wm-accent)',
                      }}
                    />
                    <span
                      className="font-mono font-bold uppercase text-wm-accent"
                      style={{ fontSize: 9, letterSpacing: 1.5 }}
                    >
                      Active now
                    </span>
                  </>
                )}
                {isActive && role && (
                  <span
                    className="font-mono"
                    style={{ fontSize: 9, color: '#6e6e6e' }}
                  >
                    ·
                  </span>
                )}
                {role && (
                  <span
                    className="truncate font-mono"
                    style={{
                      fontSize: 9,
                      fontWeight: 500,
                      letterSpacing: 0.5,
                      color: '#6e6e6e',
                    }}
                  >
                    {role}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center" style={{ gap: 6 }}>
            <HeaderRound label="Voice call">
              <Phone style={{ width: 14, height: 14, color: '#999999' }} />
            </HeaderRound>
            <HeaderRound label="Video call">
              <Video style={{ width: 14, height: 14, color: '#999999' }} />
            </HeaderRound>
            <HeaderRound label="Search messages">
              <Search style={{ width: 14, height: 14, color: '#999999' }} />
            </HeaderRound>
            {isGroup ? (
              <HeaderRound
                label="Members"
                onClick={() => setShowMembers((v) => !v)}
                active={showMembers}
              >
                <Users style={{ width: 14, height: 14 }} />
              </HeaderRound>
            ) : (
              <HeaderRound label="More">
                <MoreHorizontal style={{ width: 14, height: 14, color: '#999999' }} />
              </HeaderRound>
            )}
          </div>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4">
          {messagesQ.isPending && <MessageStackSkeleton />}

          {!messagesQ.isPending && (messagesQ.data ?? []).length === 0 && (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <MessageSquare className="h-8 w-8 text-wm-text-muted" />
              <p className="text-sm text-wm-text-primary">No messages yet</p>
              <p className="font-mono text-[11px] text-wm-text-muted">
                Say hi.
              </p>
            </div>
          )}

          <div className="flex flex-col gap-2">
            {(() => {
              const msgs = messagesQ.data ?? []
              // For "Seen by …" — show on a self-sent message only if
              // it's the most recent self-sent message in the thread.
              // Avoids stacking the avatars under every message.
              const lastMineIdx = (() => {
                for (let i = msgs.length - 1; i >= 0; i--) {
                  if (
                    msgs[i].senderId === sessionUser.id &&
                    !msgs[i].deletedAt
                  ) {
                    return i
                  }
                }
                return -1
              })()
              const readsByMessage = groupReadsByMessage(
                readsQ.data ?? [],
                sessionUser.id,
                conversation,
              )
              return msgs.map((m, idx) => (
                <MessageBubble
                  key={m.id}
                  message={m}
                  isMine={m.senderId === sessionUser.id}
                  isGroup={isGroup}
                  conversation={conversation}
                  sessionUserId={sessionUser.id}
                  sessionUserName={sessionUser.name}
                  sessionUserAvatar={sessionUser.avatarUrl}
                  showReadAvatars={idx === lastMineIdx}
                  readBy={readsByMessage.get(m.id) ?? []}
                  onEdit={async (content) => {
                    await editMessage.mutateAsync({
                      messageId: m.id,
                      content,
                    })
                  }}
                  onDelete={async () => {
                    if (
                      confirm('Delete this message? It can’t be undone.')
                    ) {
                      await deleteMessage.mutateAsync(m.id)
                    }
                  }}
                />
              ))
            })()}
          </div>
        </div>

        {/* V3 composer — Pencil `kPc6V`/`NPOQP`. cmpBox: cornerRadius
            24, fill #111111, 1px #1A1A1A border, padding [6, 8, 6, 16],
            gap 8.  Left: 32 round paperclip.  Middle: input.  Right:
            32 sparkles (lime), 32 smile, 32 mic, 36×36 round LIME
            send button. */}
        <div
          className="flex w-full flex-col"
          style={{
            padding: '12px 20px 16px 20px',
            gap: 10,
            borderTop: '1px solid var(--color-wm-border)',
          }}
        >
          {typers.length > 0 && (
            <p
              className="font-mono"
              style={{ fontSize: 10, color: '#6e6e6e' }}
            >
              {typingLabel(typers.map((t) => t.typerName))}
            </p>
          )}
          {pending.length > 0 && (
            <div className="flex flex-wrap" style={{ gap: 6 }}>
              {pending.map((a) => (
                <span
                  key={a.id}
                  className="inline-flex items-center font-mono"
                  style={{
                    gap: 6,
                    padding: '4px 8px',
                    fontSize: 10,
                    background: '#000000',
                    border: '1px solid var(--color-wm-border)',
                    borderRadius: 8,
                    color: '#999999',
                  }}
                >
                  <FileIcon style={{ width: 11, height: 11 }} />
                  <span className="max-w-[160px] truncate">{a.filename}</span>
                  <span style={{ color: '#6e6e6e' }}>
                    {formatBytes(a.sizeBytes)}
                  </span>
                  <button
                    type="button"
                    onClick={() => removePending(a.id)}
                    className="cursor-pointer text-wm-text-muted hover:text-wm-error"
                    aria-label="Remove"
                  >
                    <X style={{ width: 11, height: 11 }} />
                  </button>
                </span>
              ))}
            </div>
          )}
          {uploadError && (
            <p
              className="font-mono"
              style={{ fontSize: 10, color: 'var(--color-wm-error)' }}
            >
              {uploadError}
            </p>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault()
              void handleSend()
            }}
            className="flex w-full items-center"
            style={{
              gap: 8,
              padding: '6px 8px 6px 16px',
              background: '#111111',
              borderRadius: 24,
              border: '1px solid var(--color-wm-border)',
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              hidden
              onChange={(e) => void handlePickFiles(e.target.files)}
            />
            <CmpIcon
              label="Attach file"
              onClick={() => fileInputRef.current?.click()}
              disabled={upload.isPending}
            >
              {upload.isPending ? (
                <Loader2 style={{ width: 15, height: 15 }} className="animate-spin" />
              ) : (
                <Paperclip style={{ width: 15, height: 15 }} />
              )}
            </CmpIcon>
            <input
              type="text"
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value)
                const now = Date.now()
                if (now - lastTypingSentRef.current >= 3_000) {
                  lastTypingSentRef.current = now
                  notifyTyping.mutate(conversationId)
                }
              }}
              placeholder={`Message ${displayName}…`}
              className="min-w-0 flex-1 bg-transparent font-mono outline-none placeholder:text-wm-text-muted text-wm-text-primary"
              style={{ fontSize: 13, fontWeight: 500 }}
              disabled={send.isPending}
            />
            <CmpIcon label="AI assist" lime>
              <Sparkles
                style={{ width: 15, height: 15, color: 'var(--color-wm-accent)' }}
              />
            </CmpIcon>
            <CmpIcon label="Emoji">
              <Smile style={{ width: 15, height: 15 }} />
            </CmpIcon>
            <CmpIcon label="Voice message">
              <Mic style={{ width: 15, height: 15 }} />
            </CmpIcon>
            {/* 36×36 lime round send button — Pencil P024jy. Disabled
                state dims via opacity rather than colour change so the
                lime palette doesn't shift on hover/disable. */}
            <button
              type="submit"
              disabled={
                (!draft.trim() && pending.length === 0) || send.isPending
              }
              aria-label="Send message"
              className={cn(
                'flex shrink-0 items-center justify-center transition-colors',
                send.isPending || (!draft.trim() && pending.length === 0)
                  ? 'cursor-not-allowed opacity-50'
                  : 'cursor-pointer hover:bg-wm-accent-hover',
              )}
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                background: 'var(--color-wm-accent)',
                color: '#000000',
              }}
            >
              {send.isPending ? (
                <Loader2 className="animate-spin" style={{ width: 14, height: 14 }} />
              ) : (
                <Send style={{ width: 14, height: 14 }} />
              )}
            </button>
          </form>
        </div>
      </div>

      {isGroup && showMembers && (
        <MemberPanel
          conversationId={conversationId}
          conversation={conversation}
          sessionUserId={sessionUser.id}
          onClose={() => setShowMembers(false)}
          onLeft={() => (onBack ? onBack() : router.push('/inbox'))}
        />
      )}
    </div>
  )
}

interface ReadByEntry {
  userId: string
  name: string | undefined
  avatarUrl: string | null | undefined
}

function MessageBubble({
  message,
  isMine,
  isGroup,
  conversation,
  sessionUserId,
  sessionUserName,
  sessionUserAvatar,
  showReadAvatars,
  readBy,
  onEdit,
  onDelete,
}: {
  message: ChatMessage
  isMine: boolean
  isGroup: boolean
  conversation: ConversationSummary | undefined
  sessionUserId: string
  sessionUserName: string
  sessionUserAvatar: string | null
  showReadAvatars: boolean
  readBy: ReadByEntry[]
  onEdit: (content: string) => Promise<void>
  onDelete: () => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(message.content)
  const [busy, setBusy] = useState(false)

  // Resolve sender from the conversation summary so group messages
  // render the right name + avatar without an extra lookup.
  const sender =
    message.senderId === sessionUserId
      ? {
          name: sessionUserName,
          avatarUrl: sessionUserAvatar,
        }
      : (conversation?.otherParticipants.find(
          (p) => p.id === message.senderId,
        ) ?? null)

  const senderName = sender?.name ?? 'Member'
  const senderAvatar = sender?.avatarUrl ?? null
  const isDeleted = !!message.deletedAt
  const isEdited = !!message.editedAt && !isDeleted

  const time = new Date(message.createdAt).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })

  function startEdit() {
    setDraft(message.content)
    setEditing(true)
  }
  async function commitEdit() {
    const next = draft.trim()
    if (next.length === 0 || next === message.content) {
      setEditing(false)
      return
    }
    setBusy(true)
    try {
      await onEdit(next)
      setEditing(false)
    } catch {
      // Leave the editor open with the same draft so the user can retry.
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className={cn(
        'group flex items-end gap-2',
        isMine ? 'flex-row-reverse' : 'flex-row',
      )}
    >
      <Avatar name={senderName} src={senderAvatar} size="sm" />
      <div
        className={cn(
          'max-w-[70%] flex flex-col gap-0.5',
          isMine ? 'items-end' : 'items-start',
        )}
      >
        {isGroup && !isMine && !isDeleted && (
          <span className="font-mono text-[10px] font-semibold text-wm-text-secondary">
            {senderName}
          </span>
        )}
        <div className={cn('flex items-end gap-1', isMine ? 'flex-row-reverse' : 'flex-row')}>
          {editing ? (
            <div
              className={cn(
                'flex flex-col gap-1 rounded-2xl border px-3 py-2',
                isMine
                  ? 'rounded-br-md border-wm-accent bg-wm-accent-dim'
                  : 'rounded-bl-md border-wm-border bg-wm-surface',
              )}
            >
              <textarea
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={Math.min(6, draft.split('\n').length)}
                className="min-w-[180px] resize-none bg-transparent font-mono text-[13px] text-wm-text-primary outline-none"
                disabled={busy}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    void commitEdit()
                  } else if (e.key === 'Escape') {
                    e.preventDefault()
                    setEditing(false)
                  }
                }}
              />
              <div className="flex items-center justify-end gap-1">
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="cursor-pointer text-wm-text-muted hover:text-wm-text-primary"
                  aria-label="Cancel edit"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => void commitEdit()}
                  disabled={busy || draft.trim().length === 0}
                  className="cursor-pointer text-wm-accent hover:text-wm-accent-hover disabled:opacity-40"
                  aria-label="Save edit"
                >
                  {busy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            </div>
          ) : (
            <div
              className={cn(
                'flex flex-col gap-2',
                isMine ? 'items-end' : 'items-start',
              )}
            >
              {(message.content || isDeleted) && (
                <div
                  className={cn(
                    // V3 chrome — Pencil ChatViewV3 (`X1Safv`):
                    // self bubble = rounded-2xl with squared bottom-right
                    // corner, lime fill, black text. Other = rounded-2xl
                    // with squared bottom-left corner, surface fill,
                    // 1-px border. Deleted = subdued italic.
                    'whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 font-sans text-[13px] leading-[1.5]',
                    isDeleted
                      ? 'rounded-bl-md border border-wm-border bg-wm-surface italic text-wm-text-muted'
                      : isMine
                        ? 'rounded-br-md bg-wm-accent text-wm-text-on-accent'
                        : 'rounded-bl-md border border-wm-border bg-wm-surface text-wm-text-primary',
                  )}
                >
                  {isDeleted ? 'Message deleted' : message.content}
                </div>
              )}
              {!isDeleted && (message.attachments ?? []).length > 0 && (
                <AttachmentList
                  conversationId={message.conversationId}
                  attachments={message.attachments ?? []}
                />
              )}
            </div>
          )}

          {isMine && !isDeleted && !editing && (
            <BubbleMenu
              onEdit={startEdit}
              onDelete={() => {
                void onDelete()
              }}
            />
          )}
        </div>
        <div
          className={cn(
            'flex items-center gap-1 font-mono text-[9px] text-wm-text-muted',
            isMine ? 'flex-row-reverse' : 'flex-row',
          )}
        >
          <span>{time}</span>
          {isEdited && <span>· edited</span>}
        </div>
        {isMine && showReadAvatars && readBy.length > 0 && (
          <ReadByRow readers={readBy} />
        )}
      </div>
    </div>
  )
}

/// Hover-revealed action menu attached to the user's own bubbles.
function BubbleMenu({
  onEdit,
  onDelete,
}: {
  onEdit: () => void
  onDelete: () => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative shrink-0 opacity-0 transition-opacity group-hover:opacity-100">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="cursor-pointer text-wm-text-muted hover:text-wm-text-primary"
        aria-label="Message actions"
      >
        <MoreHorizontal className="h-3.5 w-3.5" />
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-[60]"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute right-0 top-full z-[70] mt-1 min-w-[140px] border border-wm-border bg-wm-surface shadow-lg">
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                onEdit()
              }}
              className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left font-mono text-[11px] text-wm-text-primary hover:bg-wm-surface-hover"
            >
              <Pencil className="h-3 w-3" />
              Edit
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                onDelete()
              }}
              className="flex w-full cursor-pointer items-center gap-2 border-t border-wm-border px-3 py-2 text-left font-mono text-[11px] text-wm-error hover:bg-wm-error/10"
            >
              <Trash2 className="h-3 w-3" />
              Delete
            </button>
          </div>
        </>
      )}
    </div>
  )
}

/// "Seen by" avatar row, rendered under the most recent self-sent
/// message. Caps at the first 3 readers + a "+N" overflow chip so a
/// big group's read state doesn't blow out the layout.
function ReadByRow({ readers }: { readers: ReadByEntry[] }) {
  const visible = readers.slice(0, 3)
  const overflow = readers.length - visible.length
  return (
    <div className="mt-0.5 flex items-center gap-1">
      <span className="font-mono text-[9px] text-wm-text-muted">Seen by</span>
      <div className="flex -space-x-1">
        {visible.map((r) => (
          <Avatar
            key={r.userId}
            name={r.name ?? '?'}
            src={r.avatarUrl ?? null}
            size="sm"
          />
        ))}
      </div>
      {overflow > 0 && (
        <span className="font-mono text-[9px] text-wm-text-muted">
          +{overflow}
        </span>
      )}
    </div>
  )
}

function AttachmentList({
  conversationId,
  attachments,
}: {
  conversationId: string
  attachments: ChatAttachment[]
}) {
  return (
    <div className="flex flex-col gap-1">
      {attachments.map((att) => {
        const url = chatAttachmentUrl(conversationId, att.id)
        if (att.contentType.startsWith('image/')) {
          return (
            <a
              key={att.id}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="block max-w-[280px] cursor-zoom-in border border-wm-border bg-wm-surface"
            >
              {/* Plain <img> — Next/Image needs domain config and
                  these are user-uploaded thumbnails behind cookie
                  auth, which doesn't fit the optimizer. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={att.filename}
                className="block max-h-[200px] w-auto"
                loading="lazy"
              />
            </a>
          )
        }
        return (
          <a
            key={att.id}
            href={url}
            download={att.filename}
            className="inline-flex items-center gap-2 border border-wm-border bg-wm-surface px-3 py-2 font-mono text-[11px] text-wm-text-secondary hover:bg-wm-surface-hover"
          >
            <FileIcon className="h-3.5 w-3.5 shrink-0 text-wm-text-muted" />
            <span className="max-w-[200px] truncate">{att.filename}</span>
            <span className="text-wm-text-muted">
              {formatBytes(att.sizeBytes)}
            </span>
            <Download className="h-3 w-3 text-wm-text-muted" />
          </a>
        )
      })}
    </div>
  )
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

/// Pencil composer icon (`Vcmyv`/`GoEhC`/`KTbEM`/`TDzqb`): 32×32
/// transparent round-square (radius 16), centered 15-px lucide icon
/// at #999999.  `lime` overrides the colour for the AI sparkles slot.
function CmpIcon({
  label,
  onClick,
  disabled,
  lime,
  children,
}: {
  label: string
  onClick?: () => void
  disabled?: boolean
  lime?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        'flex shrink-0 items-center justify-center transition-colors',
        disabled
          ? 'cursor-not-allowed opacity-50'
          : 'cursor-pointer hover:bg-wm-surface-hover',
        !lime && 'text-wm-text-secondary hover:text-wm-text-primary',
      )}
      style={{ width: 32, height: 32, borderRadius: 16 }}
    >
      {children}
    </button>
  )
}

/// Pencil cHd round button (`hr1`/`hr2`/`hr3`/`hr4`): 36×36 round
/// (radius 18), fill #111111, centered 14-px lucide icon at #999999.
/// `active` flips to lime-tinted bg (used for the Members toggle on
/// group threads).
function HeaderRound({
  label,
  onClick,
  active,
  children,
}: {
  label: string
  onClick?: () => void
  active?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'flex shrink-0 cursor-pointer items-center justify-center transition-colors',
        active
          ? 'bg-wm-accent-dim text-wm-accent'
          : 'bg-wm-surface text-wm-text-secondary hover:bg-wm-surface-hover hover:text-wm-text-primary',
      )}
      style={{
        width: 36,
        height: 36,
        borderRadius: 18,
      }}
    >
      {children}
    </button>
  )
}

/// "Alice is typing…" / "Alice and Bob are typing…" / "Alice and N
/// others are typing…". Cap names so the label doesn't run away in
/// big groups.
function typingLabel(names: string[]): string {
  if (names.length === 0) return ''
  if (names.length === 1) return `${names[0]} is typing…`
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`
  return `${names[0]} and ${names.length - 1} others are typing…`
}

/// Bucket per-message read entries (filtering out the current user
/// — we don't render a "seen by you" chip on your own message). We
/// hydrate the displayed name + avatar from the conversation's
/// otherParticipants so the row never has to refetch.
function groupReadsByMessage(
  reads: ConversationReadEntry[],
  selfUserId: string,
  conversation: ConversationSummary | undefined,
): Map<string, ReadByEntry[]> {
  const others = new Map(
    (conversation?.otherParticipants ?? []).map((p) => [p.id, p]),
  )
  const out = new Map<string, ReadByEntry[]>()
  for (const r of reads) {
    if (r.userId === selfUserId) continue
    const p = others.get(r.userId)
    const list = out.get(r.messageId) ?? []
    list.push({
      userId: r.userId,
      name: p?.name,
      avatarUrl: p?.avatarUrl ?? null,
    })
    out.set(r.messageId, list)
  }
  return out
}

function MemberPanel({
  conversationId,
  conversation,
  sessionUserId,
  onClose,
  onLeft,
}: {
  conversationId: string
  conversation: ConversationSummary | undefined
  sessionUserId: string
  onClose: () => void
  onLeft: () => void
}) {
  const participantsQ = useParticipants(conversationId)
  const addMutation = useAddParticipants(conversationId)
  const removeMutation = useRemoveParticipant(conversationId)

  const [addQuery, setAddQuery] = useState('')
  const [adding, setAdding] = useState(false)
  const search = useContactSearch(adding ? addQuery : '')
  const [actionError, setActionError] = useState<string | null>(null)

  // Hide users who are already members from the search results.
  const memberIds = useMemo(
    () => new Set((participantsQ.data ?? []).map((p) => p.id)),
    [participantsQ.data],
  )
  const candidates: ContactSearchResult[] = useMemo(
    () => (search.data ?? []).filter((u) => !memberIds.has(u.id)),
    [search.data, memberIds],
  )

  // Best-effort detection of whether the current user is the group
  // creator. The conversation summary doesn't ship `createdBy`, so we
  // approximate by saying "you can remove others if the API allows" —
  // the server is the real authority and will 403 if not.
  const conversationLabel = conversation?.title ?? 'Group'

  async function handleAdd(userId: string) {
    setActionError(null)
    try {
      await addMutation.mutateAsync([userId])
      setAddQuery('')
    } catch (err) {
      setActionError((err as Error).message)
    }
  }

  async function handleRemove(userId: string) {
    setActionError(null)
    const isSelf = userId === sessionUserId
    if (isSelf) {
      const ok = confirm(`Leave "${conversationLabel}"?`)
      if (!ok) return
    }
    try {
      await removeMutation.mutateAsync(userId)
      if (isSelf) onLeft()
    } catch (err) {
      setActionError((err as Error).message)
    }
  }

  return (
    <aside className="flex w-[280px] shrink-0 flex-col border-l border-wm-border bg-wm-surface">
      <div className="flex items-center gap-2 border-b border-wm-border px-4 py-3">
        <Users className="h-4 w-4 text-wm-text-muted" />
        <span className="flex-1 text-sm font-semibold text-wm-text-primary">
          Members
        </span>
        <button
          type="button"
          onClick={onClose}
          className="cursor-pointer text-wm-text-muted hover:text-wm-text-primary"
          aria-label="Close members panel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Add new */}
      <div className="border-b border-wm-border p-3">
        {!adding ? (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex w-full cursor-pointer items-center justify-center gap-1 border border-wm-border bg-wm-bg px-2 py-2 font-mono text-[11px] font-semibold text-wm-text-secondary transition-colors hover:bg-wm-surface-hover"
          >
            <Plus className="h-3.5 w-3.5" />
            Add member
          </button>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-1">
              <input
                autoFocus
                type="text"
                value={addQuery}
                onChange={(e) => setAddQuery(e.target.value)}
                placeholder="Search…"
                className="flex-1 border border-wm-border bg-wm-bg px-2 py-1.5 font-mono text-[11px] outline-none focus:border-wm-accent"
              />
              <button
                type="button"
                onClick={() => {
                  setAdding(false)
                  setAddQuery('')
                }}
                className="cursor-pointer text-wm-text-muted hover:text-wm-text-primary"
                aria-label="Cancel"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            {addQuery.trim().length > 0 && (
              <div className="flex flex-col gap-1">
                {search.isPending ? (
                  <div className="flex items-center justify-center py-3">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-wm-accent" />
                  </div>
                ) : candidates.length === 0 ? (
                  <p className="font-mono text-[10px] text-wm-text-muted">
                    No matching teammates left to add.
                  </p>
                ) : (
                  candidates.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => void handleAdd(u.id)}
                      disabled={addMutation.isPending}
                      className="flex w-full cursor-pointer items-center gap-2 px-1 py-1 text-left hover:bg-wm-surface-hover disabled:opacity-60"
                    >
                      <Avatar name={u.name} src={u.avatarUrl} size="sm" />
                      <span className="flex-1 truncate text-[12px] text-wm-text-primary">
                        {u.name}
                      </span>
                      <Plus className="h-3 w-3 text-wm-accent" />
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Member list */}
      <div className="flex-1 overflow-y-auto">
        {participantsQ.isPending && (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-wm-accent" />
          </div>
        )}
        {(participantsQ.data ?? []).map((p) => {
          const isSelf = p.id === sessionUserId
          return (
            <div
              key={p.id}
              className="flex items-center gap-2 border-b border-wm-border px-4 py-2.5"
            >
              <Avatar name={p.name} src={p.avatarUrl} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-semibold text-wm-text-primary">
                  {p.name}
                  {isSelf && (
                    <span className="ml-1 font-mono text-[9px] font-normal text-wm-text-muted">
                      (you)
                    </span>
                  )}
                </p>
                <p className="truncate font-mono text-[10px] text-wm-text-muted">
                  {p.email}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleRemove(p.id)}
                disabled={removeMutation.isPending}
                className="cursor-pointer text-wm-text-muted hover:text-wm-error disabled:opacity-60"
                title={isSelf ? 'Leave group' : 'Remove member'}
              >
                {isSelf ? (
                  <LogOut className="h-3.5 w-3.5" />
                ) : (
                  <X className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          )
        })}
      </div>

      {actionError && (
        <div className="border-t border-wm-border px-4 py-2">
          <p className="font-mono text-[10px] text-wm-error">{actionError}</p>
        </div>
      )}
    </aside>
  )
}
