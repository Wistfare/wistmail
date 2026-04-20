'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  Search,
  ArrowUpDown,
  SlidersHorizontal,
  Star,
  Archive,
  Trash2,
  Tag,
  Reply,
  ReplyAll,
  Forward,
  Loader2,
  AlertTriangle,
  RefreshCw,
  CheckSquare,
  Square,
  MailOpen,
  Mail,
  FolderInput,
  Clock,
  X,
} from 'lucide-react'
import { useLabels } from '@/lib/labels'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { useCompose } from '@/components/email/compose-provider'
import { EmailBody } from '@/components/email/email-body'
import { LabelAssignPopover } from '@/components/email/label-assign-popover'
import {
  AttachmentBadge,
  AttachmentsStrip,
} from '@/components/email/attachments-strip'
import { api } from '@/lib/api-client'
import { useToast } from '@/components/ui/toast'
import { cn, formatRelativeTime } from '@/lib/utils'
import {
  type EmailListItem,
  type FullEmail,
  useArchive,
  useBulkAction,
  useDelete,
  useEmailDetail,
  useEmptyFolder,
  useFolderRetention,
  useInboxList,
  useMarkAllRead,
  useMarkRead,
  usePurge,
  useSnooze,
  useToggleStar,
} from '@/lib/email-queries'

// Row-level filter tabs above the list. Applied client-side against
// the page already loaded — no extra network — so filters compose
// with the folder param naturally.
const FILTER_TABS = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'starred', label: 'Starred' },
  { id: 'attachments', label: 'Has files' },
] as const

export default function InboxPage() {
  const searchParams = useSearchParams()
  const { openCompose } = useCompose()
  const folderParam = searchParams.get('folder') || 'inbox'

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [activeFilter, setActiveFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const listRef = useRef<HTMLDivElement | null>(null)

  // Multi-select state. A non-empty set flips the left pane into
  // "selection mode" — the top bar gets replaced by a bulk action
  // toolbar, row clicks toggle the checkbox instead of opening the
  // preview, and the detail pane clears.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const inSelectionMode = selectedIds.size > 0

  const searchInputRef = useRef<HTMLInputElement | null>(null)

  // Cache-driven data: list (paginated) + selected detail.
  const list = useInboxList(folderParam)
  const detail = useEmailDetail(selectedId)
  const selectedFull = detail.data ?? null

  // Optimistic mutation hooks.
  const star = useToggleStar()
  const markRead = useMarkRead()
  const archive = useArchive()
  const remove = useDelete()
  const purge = usePurge()
  const emptyFolder = useEmptyFolder()
  // The retention banner + Empty button only show on folders that
  // auto-purge. For everything else the folder config query is idle.
  const cleanableFolder = folderParam === 'trash' || folderParam === 'spam'
  const retention = useFolderRetention(
    (cleanableFolder ? folderParam : 'trash') as 'trash' | 'spam',
  )
  const bulk = useBulkAction()
  const markAllRead = useMarkAllRead()
  const snooze = useSnooze()
  const toast = useToast()
  const [snoozeOpen, setSnoozeOpen] = useState(false)

  // Reset selection when the folder changes.
  useEffect(() => {
    setSelectedId(null)
    setSelectedIds(new Set())
  }, [folderParam])

  // Flatten the infinite-query pages into a single array for rendering.
  const emails: EmailListItem[] = useMemo(() => {
    if (!list.data) return []
    return list.data.pages.flatMap((p) => p.data)
  }, [list.data])

  // Lazy load-more on scroll. Trigger ~600px before the bottom.
  useEffect(() => {
    const el = listRef.current
    if (!el) return
    const onScroll = () => {
      if (list.isFetchingNextPage || !list.hasNextPage) return
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 600) {
        list.fetchNextPage()
      }
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [list])

  const filteredEmails = useMemo(() => {
    return emails.filter((email) => {
      if (activeFilter === 'unread' && email.isRead) return false
      if (activeFilter === 'starred' && !email.isStarred) return false
      if (activeFilter === 'attachments' && !email.hasAttachments) return false
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        return (
          email.fromAddress.toLowerCase().includes(q) ||
          email.subject.toLowerCase().includes(q) ||
          email.snippet.toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [emails, activeFilter, searchQuery])

  function selectEmail(email: EmailListItem) {
    // In selection mode, clicking a row toggles its checkbox rather
    // than opening the preview — matches Gmail's behaviour and the
    // mobile long-press mode below.
    if (inSelectionMode) {
      toggleSelect(email.id)
      return
    }
    setSelectedId(email.id)
    if (!email.isRead) markRead.mutate({ id: email.id })
  }

  // Global keyboard shortcuts. Modelled on Gmail so muscle memory
  // transfers. Events from text inputs / contentEditable are
  // ignored so typing in compose doesn't eat a `c` as "compose"
  // or `e` as "archive". `/` focuses search even if nothing else is.
  useEffect(() => {
    function isTypingSurface(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false
      const tag = target.tagName.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return true
      if (target.isContentEditable) return true
      return false
    }

    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === '/' && !isTypingSurface(e.target)) {
        e.preventDefault()
        searchInputRef.current?.focus()
        return
      }
      if (isTypingSurface(e.target)) return

      switch (e.key) {
        case 'Escape':
          if (inSelectionMode) {
            clearSelection()
            e.preventDefault()
          } else if (searchQuery) {
            setSearchQuery('')
            e.preventDefault()
          }
          return
        case 'j': {
          if (filteredEmails.length === 0) return
          const idx = selectedId
            ? filteredEmails.findIndex((em) => em.id === selectedId)
            : -1
          const next =
            idx < 0 ? 0 : Math.min(idx + 1, filteredEmails.length - 1)
          selectEmail(filteredEmails[next])
          e.preventDefault()
          return
        }
        case 'k': {
          if (filteredEmails.length === 0) return
          const idx = selectedId
            ? filteredEmails.findIndex((em) => em.id === selectedId)
            : 0
          const prev = idx <= 0 ? 0 : idx - 1
          selectEmail(filteredEmails[prev])
          e.preventDefault()
          return
        }
        case 'x':
          if (selectedId) {
            toggleSelect(selectedId)
            e.preventDefault()
          }
          return
        case 'e':
          if (selectedId) {
            handleArchive(selectedId)
            e.preventDefault()
          }
          return
        case '#':
        case 'Delete':
          if (selectedId) {
            handleDelete(selectedId)
            e.preventDefault()
          }
          return
        case 's':
          if (selectedId) {
            const em = emails.find((m) => m.id === selectedId)
            if (em) star.mutate(em)
            e.preventDefault()
          }
          return
        case 'c':
          openCompose()
          e.preventDefault()
          return
        case 'r':
          if (selectedFull) {
            handleReply()
            e.preventDefault()
          }
          return
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    filteredEmails,
    selectedId,
    selectedFull,
    inSelectionMode,
    searchQuery,
    emails,
  ])

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAllVisible() {
    setSelectedIds(new Set(filteredEmails.map((e) => e.id)))
  }

  function clearSelection() {
    setSelectedIds(new Set())
  }

  /// Fire a bulk action for the current selection, then clear it.
  /// Destructive actions (delete/purge) also close the detail pane
  /// if the selected email was part of the batch.
  function runBulk(action: Parameters<typeof bulk.mutate>[0]) {
    if (selectedIds.size === 0) return
    bulk.mutate(action)
    const affectedIds = [...action.ids]
    if (
      selectedId &&
      action.ids.includes(selectedId) &&
      (action.action === 'delete' ||
        action.action === 'purge' ||
        action.action === 'archive' ||
        action.action === 'move')
    ) {
      setSelectedId(null)
    }
    clearSelection()

    // Undo affordances for reversible destructive actions.
    // `purge` is permanent (bytes gone) — no undo.
    const count = affectedIds.length
    const plural = count === 1 ? 'email' : 'emails'
    if (action.action === 'delete') {
      toast.show({
        message: `${count} ${plural} moved to Trash.`,
        undo: () =>
          bulk.mutateAsync({
            ids: affectedIds,
            action: 'move',
            folder: 'inbox',
          }).then(() => {}),
      })
    } else if (action.action === 'archive') {
      toast.show({
        message: `Archived ${count} ${plural}.`,
        undo: () =>
          bulk.mutateAsync({
            ids: affectedIds,
            action: 'move',
            folder: 'inbox',
          }).then(() => {}),
      })
    } else if (action.action === 'read') {
      toast.show({
        message: `Marked ${count} as read.`,
        undo: () =>
          bulk.mutateAsync({ ids: affectedIds, action: 'unread' }).then(() => {}),
      })
    } else if (action.action === 'unread') {
      toast.show({
        message: `Marked ${count} as unread.`,
        undo: () =>
          bulk.mutateAsync({ ids: affectedIds, action: 'read' }).then(() => {}),
      })
    } else if (action.action === 'purge') {
      toast.show({ message: `Permanently deleted ${count} ${plural}.` })
    } else if (action.action === 'move') {
      toast.show({
        message: `Moved ${count} ${plural} to ${action.folder}.`,
        undo: () =>
          bulk.mutateAsync({
            ids: affectedIds,
            action: 'move',
            folder: folderParam,
          }).then(() => {}),
      })
    } else if (action.action === 'label-add') {
      toast.show({
        message: `Added label to ${count} ${plural}.`,
        undo: () =>
          bulk.mutateAsync({
            ids: affectedIds,
            action: 'label-remove',
            labelIds: action.labelIds,
          }).then(() => {}),
      })
    } else if (action.action === 'label-remove') {
      toast.show({
        message: `Removed label from ${count} ${plural}.`,
        undo: () =>
          bulk.mutateAsync({
            ids: affectedIds,
            action: 'label-add',
            labelIds: action.labelIds,
          }).then(() => {}),
      })
    }
  }

  function handleStar(email: EmailListItem) {
    star.mutate(email)
  }

  function handleArchive(emailId: string) {
    archive.mutate({ id: emailId })
    if (selectedId === emailId) setSelectedId(null)
    toast.show({
      message: 'Archived.',
      // Undo = move back to inbox. We don't know the original folder,
      // but archiving from anywhere else is uncommon enough that the
      // cheap reverse is fine; the user can move it again if needed.
      undo: () =>
        api.post(`/api/v1/inbox/emails/${emailId}/move`, { folder: 'inbox' }),
    })
  }

  function handleDelete(emailId: string) {
    remove.mutate({ id: emailId })
    if (selectedId === emailId) setSelectedId(null)
    toast.show({
      message: 'Moved to Trash.',
      // Undo flips the row straight back to inbox — the delete is
      // only a folder change, not a hard delete, so the row still
      // exists server-side even during the undo window.
      undo: () =>
        api.post(`/api/v1/inbox/emails/${emailId}/move`, { folder: 'inbox' }),
    })
  }

  function handlePermanentDelete(emailId: string) {
    if (
      !confirm(
        'Permanently delete this email? This bypasses the 30-day recovery window.',
      )
    ) {
      return
    }
    purge.mutate({ id: emailId })
    if (selectedId === emailId) setSelectedId(null)
  }

  function handleMarkAllRead() {
    const unreadCount = emails.filter((e) => !e.isRead).length
    if (unreadCount === 0) return
    markAllRead.mutate(
      { folder: folderParam },
      {
        onSuccess: (res) => {
          toast.show({
            message: `Marked ${res.affected} as read.`,
          })
        },
      },
    )
  }

  function handleEmptyFolder() {
    if (!cleanableFolder) return
    if (emails.length === 0) return
    const folderNameCap = folderParam === 'trash' ? 'Trash' : 'Spam'
    if (
      !confirm(
        `Permanently delete all ${emails.length} email${
          emails.length === 1 ? '' : 's'
        } in ${folderNameCap}? This can't be undone.`,
      )
    ) {
      return
    }
    emptyFolder.mutate({ folder: folderParam as 'trash' | 'spam' })
    setSelectedId(null)
  }

  async function handleRetrySend(emailId: string) {
    try {
      await api.post(`/api/v1/inbox/emails/${emailId}/dispatch`)
    } catch (err) {
      console.error('inbox: retry failed', err)
    }
  }

  function extractDisplayName(address: string): string {
    if (address.includes('<')) return address.split('<')[0].trim().replace(/"/g, '')
    const local = address.split('@')[0]
    return local
      .split(/[._-]/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ')
  }

  function getEmailDisplayName(email: EmailListItem): string {
    if (folderParam === 'sent' || folderParam === 'drafts') {
      const to = email.toAddresses?.[0]
      if (to) return extractDisplayName(to)
      return '(no recipient)'
    }
    return extractDisplayName(email.fromAddress)
  }

  const folderName = folderParam.charAt(0).toUpperCase() + folderParam.slice(1)

  /// Idempotent subject prefix — "Re: Hello" stays "Re: Hello".
  function prefixSubject(prefix: string, subject: string): string {
    const trimmed = subject.trim()
    if (trimmed.toLowerCase().startsWith(prefix.toLowerCase())) {
      return trimmed
    }
    return `${prefix} ${trimmed.length === 0 ? '(no subject)' : trimmed}`
  }

  function extractAddress(raw: string): string {
    const match = /<([^>]+)>/.exec(raw)
    return (match ? match[1] : raw).trim()
  }

  /// "On <date>, <sender> wrote:" header + line-by-line `> ` prefixed
  /// original. Same shape as Gmail / Apple Mail / mobile compose so
  /// recipients see a familiar thread.
  function quotedReplyBody(email: FullEmail): string {
    const dt = new Date(email.createdAt)
    const fmt = dt.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
    const header = `On ${fmt}, ${email.fromAddress} wrote:`
    const original = (email.textBody ?? '')
      .split('\n')
      .map((line) => `> ${line}`)
      .join('\n')
    return `\n\n${header}\n${original}`
  }

  function handleReply() {
    if (!selectedFull) return
    openCompose({
      to: [extractAddress(selectedFull.fromAddress)],
      subject: prefixSubject('Re:', selectedFull.subject),
      body: quotedReplyBody(selectedFull),
      inReplyTo: selectedFull.id,
    })
  }

  function handleReplyAll() {
    if (!selectedFull) return
    const sender = extractAddress(selectedFull.fromAddress)
    const others = new Set<string>([
      ...(selectedFull.toAddresses ?? []).map(extractAddress),
      ...(selectedFull.cc ?? []).map(extractAddress),
    ])
    others.delete(sender)
    openCompose({
      to: [sender],
      cc: [...others].filter((a) => a.length > 0),
      subject: prefixSubject('Re:', selectedFull.subject),
      body: quotedReplyBody(selectedFull),
      inReplyTo: selectedFull.id,
    })
  }

  function handleForward() {
    if (!selectedFull) return
    openCompose({
      subject: prefixSubject('Fwd:', selectedFull.subject),
      body: `\n\n---------- Forwarded message ----------\nFrom: ${selectedFull.fromAddress}\nDate: ${new Date(
        selectedFull.createdAt,
      ).toLocaleString()}\nSubject: ${selectedFull.subject}\nTo: ${(selectedFull.toAddresses ?? []).join(', ')}${
        (selectedFull.cc ?? []).length > 0
          ? `\nCc: ${(selectedFull.cc ?? []).join(', ')}`
          : ''
      }\n\n${selectedFull.textBody || ''}`,
    })
  }

  /// Renders the email body via the sandboxed iframe component, which
  /// handles HTML sanitization, cid: attachment resolution, and the
  /// remote-image privacy gate. Plain-text emails are rendered by the
  /// EmailBody component's text-fallback path.
  function renderEmailBody(email: FullEmail) {
    return (
      <EmailBody
        htmlBody={email.htmlBody}
        textBody={email.textBody}
        attachments={email.attachments}
      />
    )
  }

  return (
    <div className="flex h-full">
      {/* ── Email list pane ── */}
      <div className="flex w-[380px] shrink-0 flex-col border-r border-wm-border">
        <div className="flex items-center gap-2 border-b border-wm-border bg-wm-surface px-5 py-2.5">
          <Search className="h-4 w-4 text-wm-text-muted" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={`Search ${folderName.toLowerCase()}...`}
            className="flex-1 bg-transparent font-mono text-xs text-wm-text-primary placeholder:text-wm-text-muted outline-none"
          />
        </div>

        {inSelectionMode ? (
          <BulkActionToolbar
            count={selectedIds.size}
            visibleCount={filteredEmails.length}
            folder={folderParam}
            onSelectAllVisible={selectAllVisible}
            onClear={clearSelection}
            onRun={(action) =>
              runBulk({ ids: Array.from(selectedIds), ...action })
            }
          />
        ) : (
          <div className="flex items-center border-b border-wm-border px-5 py-3">
            <span className="text-sm font-semibold text-wm-text-primary">{folderName}</span>
            <div className="flex-1" />
            {emails.some((e) => !e.isRead) && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                disabled={markAllRead.isPending}
                className="mr-3 inline-flex cursor-pointer items-center gap-1 border border-wm-border px-2 py-1 font-mono text-[10px] font-semibold text-wm-text-secondary transition-colors hover:bg-wm-surface-hover disabled:cursor-wait disabled:opacity-60"
                title="Mark everything in this folder as read"
              >
                <MailOpen className="h-3 w-3" />
                {markAllRead.isPending ? 'Marking…' : 'Mark all read'}
              </button>
            )}
            {cleanableFolder && emails.length > 0 && (
              <button
                type="button"
                onClick={handleEmptyFolder}
                disabled={emptyFolder.isPending}
                className="mr-3 inline-flex cursor-pointer items-center gap-1 border border-wm-error/40 bg-wm-error/10 px-2 py-1 font-mono text-[10px] font-semibold text-wm-error transition-colors hover:bg-wm-error/20 disabled:cursor-wait disabled:opacity-60"
                title={`Permanently delete every email in ${folderName}`}
              >
                <Trash2 className="h-3 w-3" />
                {emptyFolder.isPending
                  ? 'Emptying…'
                  : `Empty ${folderParam}`}
              </button>
            )}
            <ArrowUpDown className="h-3.5 w-3.5 cursor-pointer text-wm-text-muted" />
            <SlidersHorizontal className="ml-3 h-3.5 w-3.5 cursor-pointer text-wm-text-muted" />
          </div>
        )}

        {cleanableFolder && (
          <div className="border-b border-wm-border bg-wm-warning/5 px-5 py-2">
            <p className="font-mono text-[10px] text-wm-text-muted">
              Emails here are permanently deleted after{' '}
              <span className="font-semibold text-wm-text-secondary">
                {retention.data?.retentionDays ?? 30}
              </span>{' '}
              days.
            </p>
          </div>
        )}

        <div className="flex items-center border-b border-wm-border px-5">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveFilter(tab.id)}
              className={cn(
                'cursor-pointer px-3 py-2.5 font-mono text-[11px] transition-colors',
                activeFilter === tab.id
                  ? 'border-b-2 border-wm-accent font-medium text-wm-accent'
                  : 'text-wm-text-muted hover:text-wm-text-secondary',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div ref={listRef} className="flex-1 overflow-y-auto">
          {list.isPending && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-5 w-5 animate-spin text-wm-accent" />
            </div>
          )}

          {list.isError && (
            <div className="flex flex-col items-center justify-center gap-2 py-16">
              <AlertTriangle className="h-5 w-5 text-wm-error" />
              <p className="font-mono text-xs text-wm-text-muted">
                Couldn&rsquo;t load emails
              </p>
              <Button variant="ghost" size="sm" onClick={() => list.refetch()}>
                Try again
              </Button>
            </div>
          )}

          {!list.isPending && !list.isError && filteredEmails.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 py-16">
              <p className="text-sm text-wm-text-muted">
                {searchQuery
                  ? 'No results found'
                  : activeFilter === 'unread'
                    ? 'No unread emails'
                    : 'No emails yet'}
              </p>
            </div>
          )}

          {filteredEmails.map((email) => (
            <button
              key={email.id}
              onClick={() => selectEmail(email)}
              className={cn(
                'group flex w-full cursor-pointer flex-col gap-1.5 border-b border-wm-border px-5 py-3.5 text-left transition-colors',
                selectedId === email.id && !inSelectionMode
                  ? 'border-l-2 border-l-wm-accent bg-wm-surface'
                  : selectedIds.has(email.id)
                    ? 'border-l-2 border-l-wm-accent bg-wm-accent/5'
                    : 'hover:bg-wm-surface-hover',
              )}
            >
              <div className="flex items-center gap-2">
                {/* Row checkbox — hidden behind a hover reveal when
                    nothing's selected, always visible in selection
                    mode so the user can unselect without fumbling. */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleSelect(email.id)
                  }}
                  className={cn(
                    'flex h-4 w-4 shrink-0 items-center justify-center text-wm-text-muted transition-opacity hover:text-wm-accent',
                    inSelectionMode || selectedIds.has(email.id)
                      ? 'opacity-100'
                      : 'opacity-0 group-hover:opacity-100',
                  )}
                  aria-label={selectedIds.has(email.id) ? 'Deselect' : 'Select'}
                >
                  {selectedIds.has(email.id) ? (
                    <CheckSquare className="h-4 w-4 text-wm-accent" />
                  ) : (
                    <Square className="h-4 w-4" />
                  )}
                </button>
                {!email.isRead && (
                  <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-wm-accent" />
                )}
                <span
                  className={cn(
                    'flex-1 truncate text-[13px]',
                    !email.isRead
                      ? 'font-semibold text-wm-text-primary'
                      : 'font-normal text-wm-text-secondary',
                  )}
                >
                  {getEmailDisplayName(email)}
                </span>
                <Star
                  className={cn(
                    'h-3.5 w-3.5 shrink-0 cursor-pointer',
                    email.isStarred ? 'fill-wm-accent text-wm-accent' : 'text-wm-text-muted',
                  )}
                  onClick={(e) => {
                    e.stopPropagation()
                    handleStar(email)
                  }}
                />
                <span className="shrink-0 font-mono text-[10px] text-wm-text-muted">
                  {formatRelativeTime(new Date(email.createdAt))}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'flex-1 truncate text-[13px]',
                    !email.isRead
                      ? 'font-medium text-wm-text-primary'
                      : 'font-normal text-wm-text-secondary',
                  )}
                >
                  {email.subject || '(no subject)'}
                </span>
                {email.hasAttachments && <AttachmentBadge count={1} />}
              </div>

              <div className="flex items-center gap-2">
                <span className="line-clamp-2 flex-1 font-mono text-[11px] leading-[1.4] text-wm-text-muted">
                  {email.snippet}
                </span>
                <SendStatusPill
                  status={email.status}
                  onRetry={() => handleRetrySend(email.id)}
                />
              </div>
              <RowLabels labels={email.labels ?? []} />
            </button>
          ))}

          {list.isFetchingNextPage && (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-4 w-4 animate-spin text-wm-accent" />
            </div>
          )}
        </div>
      </div>

      {/* ── Email preview pane ── */}
      <div className="flex flex-1 flex-col">
        {!selectedId ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center bg-wm-accent">
              <span className="text-xl font-bold text-wm-text-on-accent">W</span>
            </div>
            <p className="text-base font-medium text-wm-text-primary">
              {emails.length > 0 ? 'Select an email to read' : 'Your inbox is empty'}
            </p>
            <p className="font-mono text-xs text-wm-text-muted">
              Emails will appear here when you receive them.
            </p>
          </div>
        ) : !selectedFull ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-wm-accent" />
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 border-b border-wm-border px-6 py-3">
              <h2 className="flex-1 truncate text-base font-semibold text-wm-text-primary">
                {selectedFull.subject || '(no subject)'}
              </h2>
              <SendStatusPill
                status={selectedFull.status}
                onRetry={() => handleRetrySend(selectedFull.id)}
              />
              <Archive
                className="h-4 w-4 cursor-pointer text-wm-text-muted hover:text-wm-text-secondary"
                onClick={() => handleArchive(selectedFull.id)}
              />
              <div className="relative">
                <Clock
                  className="h-4 w-4 cursor-pointer text-wm-text-muted hover:text-wm-text-secondary"
                  onClick={() => setSnoozeOpen((o) => !o)}
                />
                {snoozeOpen && (
                  <SnoozeMenu
                    onPick={(until) => {
                      setSnoozeOpen(false)
                      snooze.mutate({ id: selectedFull.id, until })
                      setSelectedId(null)
                      toast.show({
                        message: until
                          ? `Snoozed until ${new Date(until).toLocaleString()}.`
                          : 'Unsnoozed.',
                        undo: () =>
                          api.post(
                            `/api/v1/inbox/emails/${selectedFull.id}/snooze`,
                            { until: null },
                          ),
                      })
                    }}
                    onDismiss={() => setSnoozeOpen(false)}
                    currentlySnoozed={selectedFull.folder === 'inbox' && Boolean((selectedFull as unknown as { snoozeUntil?: string | null }).snoozeUntil)}
                  />
                )}
              </div>
              <LabelAssignPopover
                emailId={selectedFull.id}
                trigger={
                  <Tag className="h-4 w-4 cursor-pointer text-wm-text-muted hover:text-wm-text-secondary" />
                }
              />
              {selectedFull.folder === 'trash' ? (
                <button
                  type="button"
                  onClick={() => handlePermanentDelete(selectedFull.id)}
                  className="inline-flex cursor-pointer items-center gap-1 border border-wm-error/40 bg-wm-error/10 px-2 py-1 font-mono text-[10px] font-semibold text-wm-error transition-colors hover:bg-wm-error/20"
                  title="Delete this email permanently — bypasses the 30-day trash window"
                >
                  <Trash2 className="h-3 w-3" />
                  Delete forever
                </button>
              ) : (
                <Trash2
                  className="h-4 w-4 cursor-pointer text-wm-text-muted hover:text-wm-text-secondary"
                  onClick={() => handleDelete(selectedFull.id)}
                />
              )}
            </div>

            <div className="flex items-center gap-3 border-b border-wm-border px-6 py-3">
              <Avatar name={extractDisplayName(selectedFull.fromAddress)} size="md" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-wm-text-primary">
                  {extractDisplayName(selectedFull.fromAddress)}
                </p>
                <p className="font-mono text-[10px] text-wm-text-muted">
                  {selectedFull.fromAddress} · {new Date(selectedFull.createdAt).toLocaleString()}
                </p>
              </div>
              <div className="flex gap-1.5">
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Reply className="h-3.5 w-3.5" />}
                  onClick={handleReply}
                >
                  Reply
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<ReplyAll className="h-3.5 w-3.5" />}
                  onClick={handleReplyAll}
                >
                  Reply All
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Forward className="h-3.5 w-3.5" />}
                  onClick={handleForward}
                >
                  Forward
                </Button>
              </div>
            </div>

            <AttachmentsStrip
              emailId={selectedFull.id}
              attachments={selectedFull.attachments ?? []}
            />
            <div className="flex-1 overflow-y-auto px-6 py-6">{renderEmailBody(selectedFull)}</div>
          </>
        )}
      </div>

      <style jsx global>{`
        .email-body blockquote {
          border-left: 2px solid var(--color-wm-text-muted);
          padding-left: 12px;
          margin: 8px 0;
          opacity: 0.7;
        }
        .email-body img {
          max-width: 100%;
          height: auto;
        }
        .email-body a {
          color: var(--color-wm-accent);
          text-decoration: underline;
        }
        .email-body table {
          border-collapse: collapse;
        }
        .email-body td,
        .email-body th {
          padding: 4px 8px;
        }
      `}</style>
    </div>
  )
}

/// Renders the lifecycle pill on email rows + the detail header. Idle
/// (the common case for inbound mail) shows nothing — we don't clutter
/// the row with "Sent" labels for normal received mail.
function SendStatusPill({
  status,
  onRetry,
}: {
  status: EmailListItem['status']
  onRetry: () => void
}) {
  if (status === 'idle' || status === 'sent') return null
  if (status === 'sending') {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 bg-wm-accent/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-wm-accent">
        <Loader2 className="h-2.5 w-2.5 animate-spin" />
        Sending
      </span>
    )
  }
  if (status === 'rate_limited') {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 bg-wm-warning/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-wm-warning">
        <Loader2 className="h-2.5 w-2.5" />
        Queued
      </span>
    )
  }
  // status === 'failed'
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onRetry()
      }}
      className="inline-flex shrink-0 cursor-pointer items-center gap-1 bg-wm-error/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-wm-error hover:bg-wm-error/20"
      title="Couldn't send — tap to retry"
    >
      <RefreshCw className="h-2.5 w-2.5" />
      Retry
    </button>
  )
}

/// Tiny chip strip rendered under the row preview. Empty + collapsed
/// when the email has no labels (the common case). Labels now ship
/// baked into the list response — no per-row fetch — so the old
/// QueryClient plumbing is gone.
function RowLabels({
  labels,
}: {
  labels: { id: string; name: string; color: string }[]
}) {
  if (labels.length === 0) return null
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {labels.map((l) => (
        <span
          key={l.id}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase"
          style={{ backgroundColor: `${l.color}22`, color: l.color }}
        >
          <span className="h-1.5 w-1.5" style={{ backgroundColor: l.color }} />
          {l.name}
        </span>
      ))}
    </div>
  )
}

type BulkActionVars =
  | { action: 'read' }
  | { action: 'unread' }
  | { action: 'archive' }
  | { action: 'delete' }
  | { action: 'purge' }
  | { action: 'move'; folder: string }
  | { action: 'label-add'; labelIds: string[] }
  | { action: 'label-remove'; labelIds: string[] }

/// Destination folders the "Move to" dropdown offers. We intentionally
/// skip source folders that a bulk move would imply (the current
/// folder) — the toolbar strips those at render time.
const MOVE_TARGETS: { id: string; label: string }[] = [
  { id: 'inbox', label: 'Inbox' },
  { id: 'archive', label: 'Archive' },
  { id: 'spam', label: 'Spam' },
  { id: 'trash', label: 'Trash' },
]

/// Top-of-list action bar that replaces the folder title when one or
/// more rows are selected. Keeps the same height so the list below
/// doesn't jump. Actions mirror the single-email toolbar in the
/// detail pane but operate on the selection set. Move / Label are
/// intentionally omitted here — those need secondary UI (folder
/// picker / label picker) and would make the bar crowded; they'll
/// land as a "More…" menu in a follow-up.
function BulkActionToolbar({
  count,
  visibleCount,
  folder,
  onSelectAllVisible,
  onClear,
  onRun,
}: {
  count: number
  visibleCount: number
  folder: string
  onSelectAllVisible: () => void
  onClear: () => void
  onRun: (action: BulkActionVars) => void
}) {
  const allSelected = count >= visibleCount && visibleCount > 0
  const [openMenu, setOpenMenu] = useState<'move' | 'labels' | null>(null)
  const labels = useLabels()
  return (
    <div className="relative flex items-center gap-2 border-b border-wm-border bg-wm-accent/5 px-5 py-2.5">
      <button
        type="button"
        onClick={allSelected ? onClear : onSelectAllVisible}
        className="inline-flex cursor-pointer items-center gap-1 text-wm-accent hover:text-wm-text-primary"
        title={allSelected ? 'Clear selection' : 'Select all visible'}
      >
        {allSelected ? (
          <CheckSquare className="h-4 w-4" />
        ) : (
          <Square className="h-4 w-4" />
        )}
      </button>
      <span className="font-mono text-[11px] font-semibold text-wm-text-secondary">
        {count} selected
      </span>
      <div className="flex-1" />

      <BulkBtn
        icon={<MailOpen className="h-3.5 w-3.5" />}
        label="Read"
        onClick={() => onRun({ action: 'read' })}
      />
      <BulkBtn
        icon={<Mail className="h-3.5 w-3.5" />}
        label="Unread"
        onClick={() => onRun({ action: 'unread' })}
      />
      {folder !== 'archive' && folder !== 'trash' && (
        <BulkBtn
          icon={<Archive className="h-3.5 w-3.5" />}
          label="Archive"
          onClick={() => onRun({ action: 'archive' })}
        />
      )}

      {/* Move-to-folder popover. Opens a small menu of destinations
          that excludes the current folder so the user can't no-op
          move into itself. */}
      <div className="relative">
        <BulkBtn
          icon={<FolderInput className="h-3.5 w-3.5" />}
          label="Move"
          onClick={() =>
            setOpenMenu((m) => (m === 'move' ? null : 'move'))
          }
        />
        {openMenu === 'move' && (
          <MoveMenu
            currentFolder={folder}
            onPick={(target) => {
              setOpenMenu(null)
              onRun({ action: 'move', folder: target })
            }}
            onDismiss={() => setOpenMenu(null)}
          />
        )}
      </div>

      {/* Labels popover. Tapping a label toggles add/remove on the
          whole selection in one API call. Fast-open: we read the
          label list from the already-cached /labels query. */}
      <div className="relative">
        <BulkBtn
          icon={<Tag className="h-3.5 w-3.5" />}
          label="Labels"
          onClick={() =>
            setOpenMenu((m) => (m === 'labels' ? null : 'labels'))
          }
        />
        {openMenu === 'labels' && (
          <LabelMenu
            labels={labels.data ?? []}
            onPickAdd={(id) => {
              setOpenMenu(null)
              onRun({ action: 'label-add', labelIds: [id] })
            }}
            onPickRemove={(id) => {
              setOpenMenu(null)
              onRun({ action: 'label-remove', labelIds: [id] })
            }}
            onDismiss={() => setOpenMenu(null)}
          />
        )}
      </div>

      {folder === 'trash' ? (
        <BulkBtn
          icon={<Trash2 className="h-3.5 w-3.5" />}
          label="Delete forever"
          destructive
          onClick={() => {
            if (
              confirm(
                `Permanently delete ${count} email${count === 1 ? '' : 's'}? This can't be undone.`,
              )
            ) {
              onRun({ action: 'purge' })
            }
          }}
        />
      ) : (
        <BulkBtn
          icon={<Trash2 className="h-3.5 w-3.5" />}
          label="Delete"
          destructive
          onClick={() => onRun({ action: 'delete' })}
        />
      )}
      <button
        type="button"
        onClick={onClear}
        className="ml-2 inline-flex cursor-pointer items-center gap-1 border border-wm-border px-2 py-1 font-mono text-[10px] font-semibold text-wm-text-secondary hover:bg-wm-surface-hover"
        title="Clear selection"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  )
}

/// Tiny dropdown listing folder destinations. Light-touch: no
/// outside-click detection beyond a full-screen invisible backdrop
/// because the dropdown is small and the selection flow is linear.
function MoveMenu({
  currentFolder,
  onPick,
  onDismiss,
}: {
  currentFolder: string
  onPick: (folder: string) => void
  onDismiss: () => void
}) {
  const targets = MOVE_TARGETS.filter((t) => t.id !== currentFolder)
  return (
    <>
      <div
        className="fixed inset-0 z-[60]"
        onClick={onDismiss}
        aria-hidden="true"
      />
      <div className="absolute right-0 top-full z-[70] mt-1 min-w-[160px] border border-wm-border bg-wm-surface shadow-lg">
        <p className="border-b border-wm-border px-3 py-1.5 font-mono text-[9px] font-semibold uppercase text-wm-text-muted">
          Move to
        </p>
        {targets.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onPick(t.id)}
            className="block w-full cursor-pointer px-3 py-2 text-left font-mono text-[11px] text-wm-text-primary hover:bg-wm-surface-hover"
          >
            {t.label}
          </button>
        ))}
      </div>
    </>
  )
}

/// Tiny multi-select for labels. Tapping a label dispatches one bulk
/// action per tap (add or remove) — we don't batch across multiple
/// labels because the user typically only flips one chip at a time;
/// if they pick three we just fire three calls, which is still one
/// round-trip per label thanks to the batch endpoint.
function LabelMenu({
  labels,
  onPickAdd,
  onPickRemove,
  onDismiss,
}: {
  labels: { id: string; name: string; color: string }[]
  onPickAdd: (id: string) => void
  onPickRemove: (id: string) => void
  onDismiss: () => void
}) {
  return (
    <>
      <div
        className="fixed inset-0 z-[60]"
        onClick={onDismiss}
        aria-hidden="true"
      />
      <div className="absolute right-0 top-full z-[70] mt-1 min-w-[220px] border border-wm-border bg-wm-surface shadow-lg">
        <p className="border-b border-wm-border px-3 py-1.5 font-mono text-[9px] font-semibold uppercase text-wm-text-muted">
          Add label · shift-click to remove
        </p>
        {labels.length === 0 ? (
          <p className="px-3 py-2 font-mono text-[11px] text-wm-text-muted">
            No labels yet. Create one in Settings.
          </p>
        ) : (
          <div className="max-h-[240px] overflow-y-auto">
            {labels.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={(e) => {
                  if (e.shiftKey) onPickRemove(l.id)
                  else onPickAdd(l.id)
                }}
                className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left hover:bg-wm-surface-hover"
                title="Click to add, Shift+click to remove"
              >
                <span
                  className="h-2.5 w-2.5 shrink-0"
                  style={{ backgroundColor: l.color }}
                />
                <span className="truncate font-mono text-[11px] text-wm-text-primary">
                  {l.name}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

function BulkBtn({
  icon,
  label,
  destructive = false,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  destructive?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex cursor-pointer items-center gap-1 border px-2 py-1 font-mono text-[10px] font-semibold transition-colors',
        destructive
          ? 'border-wm-error/40 text-wm-error hover:bg-wm-error/10'
          : 'border-wm-border text-wm-text-secondary hover:bg-wm-surface-hover',
      )}
    >
      {icon}
      {label}
    </button>
  )
}

/// Shared presets for the snooze dropdown. The times are computed at
/// render time so "Tomorrow morning" is tomorrow from the user's
/// wall-clock perspective, not the server's UTC.
function computeSnoozePresets(now: Date = new Date()) {
  const d = (year: number, month: number, date: number, h: number, m = 0) =>
    new Date(year, month, date, h, m, 0, 0)
  const today = d(now.getFullYear(), now.getMonth(), now.getDate(), 0)
  const laterToday = new Date(today)
  // "Later today" = 3 hours from now, rounded up to the next hour.
  laterToday.setTime(now.getTime() + 3 * 60 * 60 * 1000)
  laterToday.setMinutes(0, 0, 0)
  const tomorrowMorning = d(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() + 1,
    8,
  )
  // Saturday 9am. If it's already Saturday / Sunday we push to next week.
  const saturday = new Date(today)
  const dow = today.getDay()
  const daysUntilSat = dow === 6 ? 7 : (6 - dow + 7) % 7 || 7
  saturday.setDate(today.getDate() + daysUntilSat)
  saturday.setHours(9, 0, 0, 0)
  const nextWeek = d(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() + 7,
    8,
  )
  return [
    { label: 'Later today', hint: formatWallTime(laterToday), at: laterToday },
    {
      label: 'Tomorrow',
      hint: formatWallTime(tomorrowMorning),
      at: tomorrowMorning,
    },
    {
      label: 'This weekend',
      hint: formatWallTime(saturday),
      at: saturday,
    },
    { label: 'Next week', hint: formatWallTime(nextWeek), at: nextWeek },
  ]
}

function formatWallTime(d: Date): string {
  return d.toLocaleString(undefined, {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function SnoozeMenu({
  onPick,
  onDismiss,
  currentlySnoozed,
}: {
  onPick: (until: string | null) => void
  onDismiss: () => void
  currentlySnoozed: boolean
}) {
  const presets = computeSnoozePresets()
  return (
    <>
      <div
        className="fixed inset-0 z-[60]"
        onClick={onDismiss}
        aria-hidden="true"
      />
      <div className="absolute right-0 top-full z-[70] mt-1 min-w-[220px] border border-wm-border bg-wm-surface shadow-lg">
        <p className="border-b border-wm-border px-3 py-1.5 font-mono text-[9px] font-semibold uppercase text-wm-text-muted">
          Snooze until
        </p>
        {presets.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => onPick(p.at.toISOString())}
            className="flex w-full cursor-pointer items-center justify-between px-3 py-2 text-left hover:bg-wm-surface-hover"
          >
            <span className="font-mono text-[11px] text-wm-text-primary">
              {p.label}
            </span>
            <span className="font-mono text-[10px] text-wm-text-muted">
              {p.hint}
            </span>
          </button>
        ))}
        {currentlySnoozed && (
          <button
            type="button"
            onClick={() => onPick(null)}
            className="block w-full cursor-pointer border-t border-wm-border px-3 py-2 text-left font-mono text-[11px] text-wm-accent hover:bg-wm-accent/10"
          >
            Unsnooze now
          </button>
        )}
      </div>
    </>
  )
}
