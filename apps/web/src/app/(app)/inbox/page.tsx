'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Search,
  ArrowUpDown,
  SlidersHorizontal,
  Archive,
  AlarmClock,
  Trash2,
  Tag,
  Reply,
  ReplyAll,
  Forward,
  Loader2,
  AlertTriangle,
  RefreshCw,
  CalendarPlus,
  CheckSquare,
  ChevronDown,
  ListChecks,
  Square,
  MailOpen,
  Mail,
  MessageSquare,
  MoreHorizontal,
  Plus,
  FolderInput,
  X,
} from 'lucide-react'
import { useLabels } from '@/lib/labels'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { useCompose } from '@/components/email/compose-provider'
import { EmailBody } from '@/components/email/email-body'
import { LabelAssignPopover } from '@/components/email/label-assign-popover'
import { AttachmentsStrip } from '@/components/email/attachments-strip'
import { EmailRowV3 } from '@/components/email/email-row-v3'
import { FilterPills } from '@/components/email/filter-pills'
import { InboxSectionHeader } from '@/components/email/inbox-section-header'
import { AIBrief } from '@/components/email/ai-brief'
import { TodayPanel, type TodayEvent } from '@/components/email/today-panel'
import {
  rangeForWeek,
  useEventsInRange,
  type CalendarEvent,
} from '@/lib/event-queries'
import { groupEmailsBySection } from '@/lib/inbox-sections'
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
  useEmailThread,
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

type ContentType = 'all' | 'mail' | 'chat'

export default function InboxPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { openCompose } = useCompose()
  const folderParam = searchParams.get('folder') || 'inbox'

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [activeFilter, setActiveFilter] = useState('all')
  /// Pencil InboxV3 segmented control: All / Mail / Chat. We gate
  /// emails at the list level here; clicking "Chat" navigates over to
  /// /chat — the unified inbox feed lives on mobile only for now.
  const [contentType, setContentType] = useState<ContentType>('all')
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

  /// Group filtered emails into Today / Yesterday / This week / Earlier
  /// bands so the list pane gets the V3 section dividers. Pencil
  /// reference: `InboxV3.sec1` / `sec2` (`TB36x`). Helper lives in
  /// `lib/inbox-sections.ts` so it can be unit-tested without dragging
  /// the inbox page's deps in.
  const sections = useMemo(
    () => groupEmailsBySection(filteredEmails),
    [filteredEmails],
  )

  /// "23 UNREAD · 2 MENTIONS" subtitle on the inbox header. Mentions
  /// are not yet computed server-side — `@me` matching is a future
  /// hook, so we surface the unread count plus a `0 MENTIONS` until
  /// then.
  const unreadCount = useMemo(
    () => emails.filter((e) => !e.isRead).length,
    [emails],
  )

  /// Today's events feeding the right-hand `TodayPanel` (Pencil
  /// `InboxV3.TodayRail`). Only show on the actual `inbox` folder; the
  /// other folders (sent / drafts / trash etc) keep the 2-column layout
  /// from before.
  const showTodayRail = folderParam === 'inbox' && !inSelectionMode
  const todayRange = useMemo(() => rangeForWeek(new Date()), [])
  const todayEvents = useEventsInRange(todayRange.from, todayRange.to)
  const todayPanelEvents = useMemo<TodayEvent[]>(() => {
    if (!todayEvents.data) return []
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    return todayEvents.data
      .filter((e: CalendarEvent) => {
        const start = new Date(e.startAt)
        return start >= today && start < tomorrow
      })
      .map((e: CalendarEvent, idx: number) => ({
        id: e.id,
        title: e.title,
        startsAt: e.startAt,
        endsAt: e.endAt,
        location: e.location ?? undefined,
        meetingUrl: e.meetingLink ?? undefined,
        isNext: idx === 0,
      }))
  }, [todayEvents.data])

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

  /// Pencil InboxV3 segmented control (`InboxV3.segWrap`):
  ///   [All · 23] [Mail] [Chat]   [🔍]
  /// Clicking "Chat" leaves the inbox feed entirely — the unified
  /// inbox feed is mobile-only for now.
  function onContentTypeChange(next: ContentType) {
    setContentType(next)
    if (next === 'chat') router.push('/chat')
  }

  return (
    <div className="flex h-full">
      {/* ── Email list pane ──
          Pencil InboxV3.InboxList (`JYmWQ`): width 420, fill #000000,
          1px right hairline #1A1A1A. */}
      <div
        className="flex w-[420px] shrink-0 flex-col"
        style={{
          background: '#000000',
          borderRight: '1px solid var(--color-wm-border)',
        }}
      >
        {/* V3 header (`gDkMT`, padding [24, 20, 16, 20], gap 6 vertical):
              hRow: "Inbox" 32/700 white  ↔  "+ NEW ▾" lime pill
              "23 UNREAD · 2 MENTIONS" 10/500 #999999 tracking 1.5 */}
        <header
          className="flex flex-col"
          style={{ gap: 6, padding: '24px 20px 16px 20px' }}
        >
          <div className="flex w-full items-center justify-between">
            <h1
              className="font-mono font-bold text-wm-text-primary"
              style={{ fontSize: 32 }}
            >
              {folderName}
            </h1>
            <button
              type="button"
              onClick={() => openCompose()}
              className="inline-flex cursor-pointer items-center bg-wm-accent transition-colors hover:bg-wm-accent-hover"
              style={{
                gap: 7,
                padding: '8px 14px',
                borderRadius: 19,
                boxShadow: '0 4px 16px 0 rgba(191,255,0,0.25)',
                color: '#000000',
              }}
              aria-label="New message"
            >
              <Plus style={{ width: 14, height: 14 }} />
              <span
                className="font-mono font-bold uppercase"
                style={{ fontSize: 11, letterSpacing: 1 }}
              >
                New
              </span>
              <ChevronDown style={{ width: 11, height: 11 }} />
            </button>
          </div>
          <p
            className="font-mono uppercase"
            style={{
              fontSize: 10,
              fontWeight: 500,
              letterSpacing: 1.5,
              color: '#999999',
            }}
          >
            {unreadCount} unread · 0 mentions
          </p>
        </header>

        {/* segWrap (`e0hqd6`, padding [0, 20, 16, 20], gap 8):
              ALL · count   lime fill 11/700 black tracking 1
              MAIL          surface fill, mail icon 12 + "MAIL" 11/600
              CHATS         surface fill, message-square icon 12 + "CHATS"
              flex-1 spacer
              searchBtn     34×34 round (radius 17), 1px #1A1A1A border */}
        <div
          className="flex w-full items-center"
          style={{ gap: 8, padding: '0 20px 16px 20px' }}
        >
          <SegPill
            active={contentType === 'all'}
            onClick={() => onContentTypeChange('all')}
          >
            ALL
            <span
              className="font-mono font-bold"
              style={{
                fontSize: 11,
                letterSpacing: 1,
                opacity: contentType === 'all' ? 0.6 : 0.7,
              }}
            >
              {unreadCount}
            </span>
          </SegPill>
          <SegPill
            active={contentType === 'mail'}
            onClick={() => onContentTypeChange('mail')}
            icon={<Mail style={{ width: 12, height: 12 }} />}
          >
            MAIL
          </SegPill>
          <SegPill
            active={contentType === 'chat'}
            onClick={() => onContentTypeChange('chat')}
            icon={<MessageSquare style={{ width: 12, height: 12 }} />}
          >
            CHATS
          </SegPill>
          <span style={{ flex: 1 }} />
          <button
            type="button"
            onClick={() => searchInputRef.current?.focus()}
            aria-label="Search emails"
            className="flex cursor-pointer items-center justify-center bg-wm-surface text-wm-text-secondary transition-colors hover:bg-wm-surface-hover hover:text-wm-text-primary"
            style={{
              width: 34,
              height: 34,
              borderRadius: 17,
              border: '1px solid var(--color-wm-border)',
            }}
          >
            <Search style={{ width: 14, height: 14 }} />
          </button>
        </div>

        {/* Search bar — collapses to icon-only via the pill row's button. */}
        <div className="flex items-center gap-2 border-y border-wm-border bg-wm-surface px-5 py-2.5">
          <Search className="h-4 w-4 text-wm-text-muted" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={`Search ${folderName.toLowerCase()}…`}
            className="flex-1 bg-transparent font-mono text-xs text-wm-text-primary placeholder:text-wm-text-muted outline-none"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="cursor-pointer text-wm-text-muted hover:text-wm-text-secondary"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Bulk-action toolbar (replaces the secondary chrome when 1+ rows selected). */}
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
          <div className="flex items-center justify-end gap-2 border-b border-wm-border px-5 py-2">
            {emails.some((e) => !e.isRead) && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                disabled={markAllRead.isPending}
                className="inline-flex cursor-pointer items-center gap-1 border border-wm-border px-2 py-1 font-mono text-[10px] font-semibold text-wm-text-secondary transition-colors hover:bg-wm-surface-hover disabled:cursor-wait disabled:opacity-60"
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
                className="inline-flex cursor-pointer items-center gap-1 border border-wm-error/40 bg-wm-error/10 px-2 py-1 font-mono text-[10px] font-semibold text-wm-error transition-colors hover:bg-wm-error/20 disabled:cursor-wait disabled:opacity-60"
                title={`Permanently delete every email in ${folderName}`}
              >
                <Trash2 className="h-3 w-3" />
                {emptyFolder.isPending ? 'Emptying…' : `Empty ${folderParam}`}
              </button>
            )}
            {/* Read-status filter — kept as a secondary chip strip. */}
            <FilterPills
              value={activeFilter}
              options={FILTER_TABS.map((t) => ({ id: t.id, label: t.label }))}
              onChange={(id) => setActiveFilter(id)}
              className="text-[10px]"
            />
            <ArrowUpDown className="h-3.5 w-3.5 cursor-pointer text-wm-text-muted" />
            <SlidersHorizontal className="h-3.5 w-3.5 cursor-pointer text-wm-text-muted" />
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

          {/* Emails grouped into V3 date sections. */}
          {sections.map((sec) => (
            <div key={sec.label}>
              <InboxSectionHeader label={sec.label} count={sec.items.length} />
              {sec.items.map((email) => (
                <EmailRowV3
                  key={email.id}
                  email={{
                    id: email.id,
                    fromAddress: email.fromAddress,
                    displayName: getEmailDisplayName(email),
                    subject: email.subject,
                    snippet: email.snippet,
                    timeLabel: formatRowTime(email.createdAt),
                    isRead: email.isRead,
                    isStarred: email.isStarred,
                    hasAttachments: email.hasAttachments,
                    tag: 'MAIL',
                    labels: email.labels ?? [],
                  }}
                  selected={selectedId === email.id && !inSelectionMode}
                  selectionMode={inSelectionMode}
                  isChecked={selectedIds.has(email.id)}
                  onClick={() => selectEmail(email)}
                  onToggleStar={() => handleStar(email)}
                  onToggleCheck={() => toggleSelect(email.id)}
                  trailing={
                    <SendStatusPill
                      status={email.status}
                      onRetry={() => handleRetrySend(email.id)}
                    />
                  }
                />
              ))}
            </div>
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
            {/* V3 reading-pane toolbar — Pencil `InboxV3.toolbar` (`u0CIwR`):
                  padding [16, 28], 1px bottom hairline #1A1A1A, justify between
                tbL (gap 10):
                  "INBOX"   10/700 #6e6e6e tracking 1.5
                  "/"       10/600 #404040
                  "<SUBJ>"  10/700 #999999 tracking 1.5  (uppercase, truncate)
                tbR (gap 6):
                  ic1..ic5 — 32×32 round (radius 8) #111111 surface
                  archive · alarm-clock · tag · trash-2 · ellipsis
                  icons 14 #999999 */}
            <div
              className="flex w-full items-center justify-between"
              style={{
                padding: '16px 28px',
                borderBottom: '1px solid var(--color-wm-border)',
              }}
            >
              <div className="flex min-w-0 items-center" style={{ gap: 10 }}>
                <span
                  className="font-mono font-bold uppercase"
                  style={{
                    fontSize: 10,
                    letterSpacing: 1.5,
                    color: '#6e6e6e',
                  }}
                >
                  {folderName}
                </span>
                <span
                  className="font-mono font-semibold"
                  style={{ fontSize: 10, color: '#404040' }}
                >
                  /
                </span>
                <span
                  className="min-w-0 truncate font-mono font-bold uppercase"
                  style={{
                    fontSize: 10,
                    letterSpacing: 1.5,
                    color: '#999999',
                  }}
                >
                  {selectedFull.subject || '(no subject)'}
                </span>
                <SendStatusPill
                  status={selectedFull.status}
                  onRetry={() => handleRetrySend(selectedFull.id)}
                />
              </div>
              <div className="flex items-center" style={{ gap: 6 }}>
                <ToolbarIc
                  label="Archive"
                  onClick={() => handleArchive(selectedFull.id)}
                >
                  <Archive style={{ width: 14, height: 14 }} />
                </ToolbarIc>
                <div className="relative">
                  <ToolbarIc
                    label="Snooze"
                    onClick={() => setSnoozeOpen((o) => !o)}
                  >
                    <AlarmClock style={{ width: 14, height: 14 }} />
                  </ToolbarIc>
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
                      currentlySnoozed={
                        selectedFull.folder === 'inbox' &&
                        Boolean(
                          (selectedFull as unknown as { snoozeUntil?: string | null })
                            .snoozeUntil,
                        )
                      }
                    />
                  )}
                </div>
                <LabelAssignPopover
                  emailId={selectedFull.id}
                  trigger={
                    <ToolbarIc label="Add label">
                      <Tag style={{ width: 14, height: 14 }} />
                    </ToolbarIc>
                  }
                />
                {selectedFull.folder === 'trash' ? (
                  <ToolbarIc
                    label="Delete forever"
                    onClick={() => handlePermanentDelete(selectedFull.id)}
                  >
                    <Trash2
                      style={{ width: 14, height: 14, color: 'var(--color-wm-error)' }}
                    />
                  </ToolbarIc>
                ) : (
                  <ToolbarIc
                    label="Delete"
                    onClick={() => handleDelete(selectedFull.id)}
                  >
                    <Trash2 style={{ width: 14, height: 14 }} />
                  </ToolbarIc>
                )}
                <ToolbarIc label="More">
                  <MoreHorizontal style={{ width: 14, height: 14 }} />
                </ToolbarIc>
              </div>
            </div>

            {/* subjRow (Pencil `BTgy9`, gap 6):
                  "WEDNESDAY · APR 23"   10/700 #6e6e6e tracking 1
                  "<subject>"             26/700 white lineHeight 1.25
                senderRow (`Ogz6Z`, gap 12):
                  44×44 round avatar
                  sCol: name 13/600 white + "from → to,cc" 11/normal #6e6e6e
                  sActions (gap 8):
                    REPLY pill (lime) — reply icon 13 + "REPLY" 11/700 black
                    36×36 reply-all surface button (radius 18, 1px border)
                Pencil scroll wrapper (`Vmhgr`): padding [24, 28], gap 20.
                We render subjRow + senderRow inline at the top of the
                scrolling container so they don't double up with the
                toolbar above. */}
            <div
              className="flex flex-col"
              style={{
                gap: 20,
                padding: '24px 28px 0 28px',
              }}
            >
              <div className="flex flex-col" style={{ gap: 6 }}>
                <span
                  className="font-mono font-bold uppercase"
                  style={{
                    fontSize: 10,
                    letterSpacing: 1,
                    color: '#6e6e6e',
                  }}
                >
                  {formatSubjectDate(selectedFull.createdAt)}
                </span>
                <h2
                  className="font-mono font-bold text-wm-text-primary"
                  style={{ fontSize: 26, lineHeight: 1.25 }}
                >
                  {selectedFull.subject || '(no subject)'}
                </h2>
              </div>
              <div className="flex w-full items-center" style={{ gap: 12 }}>
                <Avatar name={extractDisplayName(selectedFull.fromAddress)} size="lg" />
                <div className="flex min-w-0 flex-1 flex-col" style={{ gap: 2 }}>
                  <p
                    className="truncate font-mono font-semibold text-wm-text-primary"
                    style={{ fontSize: 13 }}
                  >
                    {extractDisplayName(selectedFull.fromAddress)}
                  </p>
                  <p
                    className="truncate font-mono"
                    style={{ fontSize: 11, color: '#6e6e6e' }}
                  >
                    {extractAddress(selectedFull.fromAddress)}
                    {(selectedFull.toAddresses ?? []).length > 0 && (
                      <>  →  {(selectedFull.toAddresses ?? []).map(extractAddress).join(', ')}</>
                    )}
                  </p>
                </div>
                <div className="flex items-center" style={{ gap: 8 }}>
                  <button
                    type="button"
                    onClick={handleReply}
                    className="inline-flex cursor-pointer items-center bg-wm-accent transition-colors hover:bg-wm-accent-hover"
                    style={{
                      gap: 6,
                      padding: '8px 14px',
                      borderRadius: 18,
                      color: '#000000',
                    }}
                    aria-label="Reply"
                  >
                    <Reply style={{ width: 13, height: 13 }} />
                    <span
                      className="font-mono font-bold uppercase"
                      style={{ fontSize: 11, letterSpacing: 1 }}
                    >
                      Reply
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={handleReplyAll}
                    className="flex cursor-pointer items-center justify-center bg-wm-surface text-wm-text-primary transition-colors hover:bg-wm-surface-hover"
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      border: '1px solid var(--color-wm-border)',
                    }}
                    aria-label="Reply all"
                  >
                    <ReplyAll style={{ width: 14, height: 14 }} />
                  </button>
                  <button
                    type="button"
                    onClick={handleForward}
                    className="flex cursor-pointer items-center justify-center bg-wm-surface text-wm-text-primary transition-colors hover:bg-wm-surface-hover"
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      border: '1px solid var(--color-wm-border)',
                    }}
                    aria-label="Forward"
                  >
                    <Forward style={{ width: 14, height: 14 }} />
                  </button>
                </div>
              </div>
            </div>

            <AttachmentsStrip
              emailId={selectedFull.id}
              attachments={selectedFull.attachments ?? []}
            />
            <ThreadStrip
              anchorId={selectedFull.id}
              onPick={(id) => setSelectedId(id)}
            />
            <div
              className="flex-1 overflow-y-auto"
              style={{ padding: '20px 28px 32px 28px' }}
            >
              {/* V3 AI brief block — Pencil `InboxV3.aiBrief` (`Hyivo`).
                  Currently a deterministic placeholder; once the AI
                  pipeline emits per-thread summaries we'll switch to
                  reading `selectedFull.aiBrief.summary` + `meta`. */}
              <AIBrief
                className="mb-5"
                headline="AI BRIEF · 3 ACTION ITEMS"
                meta="DUE FRI"
                summary={summarize(selectedFull)}
                actions={[
                  {
                    id: 'draft-reply',
                    label: 'Draft reply',
                    icon: <Reply style={{ width: 13, height: 13 }} />,
                    onClick: handleReply,
                  },
                  {
                    id: 'extract-tasks',
                    label: 'Extract tasks',
                    icon: <ListChecks style={{ width: 13, height: 13 }} />,
                    onClick: () => {
                      toast.show({
                        message:
                          'Task extraction queued — we’ll surface tasks in Work.',
                      })
                    },
                  },
                  {
                    id: 'schedule-call',
                    label: 'Schedule call',
                    icon: <CalendarPlus style={{ width: 13, height: 13 }} />,
                    onClick: () => router.push('/calendar'),
                  },
                ]}
              />
              {renderEmailBody(selectedFull)}
            </div>
          </>
        )}
      </div>

      {/* ── Right rail: Today panel ── only on the inbox folder. */}
      {showTodayRail && (
        <TodayPanel
          events={todayPanelEvents}
          onJoinMeeting={(ev) => {
            if (ev.meetingUrl) {
              window.open(ev.meetingUrl, '_blank', 'noopener,noreferrer')
            } else {
              router.push('/calendar')
            }
          }}
        />
      )}

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

// Row-level label rendering moved to <EmailRowV3>; this helper is gone.

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

/// Compact list of sibling messages in the same thread as `anchorId`.
/// Hidden when the thread has only one message (the common case for
/// first inbound / solo drafts). Clicking a row swaps the right
/// pane's selected email. Rendered above the body so the user sees
/// the conversation context without scrolling.
function ThreadStrip({
  anchorId,
  onPick,
}: {
  anchorId: string
  onPick: (id: string) => void
}) {
  const thread = useEmailThread(anchorId)
  if (!thread.data || thread.data.messages.length <= 1) return null
  return (
    <div className="border-b border-wm-border bg-wm-surface/60 px-6 py-2">
      <p className="mb-1 font-mono text-[9px] font-semibold uppercase text-wm-text-muted">
        Thread · {thread.data.messages.length} messages
      </p>
      <div className="flex flex-col gap-1">
        {thread.data.messages.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => onPick(m.id)}
            className={cn(
              'group flex cursor-pointer items-center gap-2 border border-transparent px-2 py-1 text-left transition-colors hover:bg-wm-surface-hover',
              m.id === anchorId && 'border-wm-accent/40 bg-wm-accent/5',
            )}
          >
            <span className="shrink-0 font-mono text-[10px] text-wm-text-muted">
              {formatRelativeTime(new Date(m.createdAt))}
            </span>
            <span
              className={cn(
                'truncate text-[12px]',
                !m.isRead
                  ? 'font-semibold text-wm-text-primary'
                  : 'text-wm-text-secondary',
              )}
            >
              {m.fromAddress}
            </span>
            <span className="truncate font-mono text-[10px] text-wm-text-muted">
              {m.snippet}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * Pencil InboxV3 segmented-control pill (`Wi0OX`/`Rc1yj`/`C9UYRb`):
 *   active   → bg lime, fg black, label 11/700 tracking 1
 *   idle     → bg #111111, fg white, label 11/600 tracking 1
 *   padding [8, 14], radius 18, gap 6 (icon + label).
 */
function SegPill({
  active,
  icon,
  children,
  onClick,
}: {
  active: boolean
  icon?: React.ReactNode
  children: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex cursor-pointer items-center font-mono uppercase transition-colors',
        active
          ? 'bg-wm-accent hover:bg-wm-accent-hover'
          : 'bg-wm-surface hover:bg-wm-surface-hover',
      )}
      style={{
        gap: 6,
        padding: '8px 14px',
        borderRadius: 18,
        fontSize: 11,
        fontWeight: active ? 700 : 600,
        letterSpacing: 1,
        color: active ? '#000000' : '#FFFFFF',
      }}
    >
      {icon}
      {children}
    </button>
  )
}

/**
 * Pencil InboxV3 reading-pane toolbar icon button (`agWvw` etc):
 * 32×32 round-square (radius 8), surface fill #111111, 14-px lucide
 * icon at #999999.
 */
function ToolbarIc({
  label,
  onClick,
  children,
}: {
  label: string
  onClick?: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex cursor-pointer items-center justify-center bg-wm-surface text-wm-text-secondary transition-colors hover:bg-wm-surface-hover hover:text-wm-text-primary"
      style={{ width: 32, height: 32, borderRadius: 8 }}
    >
      {children}
    </button>
  )
}

/**
 * Pencil reading-pane subject eyebrow ("WEDNESDAY · APR 23" — `XNqrm`).
 * Uppercase weekday + dot-separator + uppercase MMM dd.
 */
function formatSubjectDate(iso: string): string {
  const d = new Date(iso)
  const weekday = d.toLocaleDateString(undefined, { weekday: 'long' }).toUpperCase()
  const md = d
    .toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    .toUpperCase()
  return `${weekday} · ${md}`
}

/**
 * Until the AI pipeline emits per-thread summaries we render a
 * deterministic single-paragraph placeholder mirroring the Pencil
 * mock voice ("Alex shares Q1 priorities… he's asking for your
 * feedback by Friday."). Real summaries land on
 * `selectedFull.aiBrief.summary` once the model is wired up.
 */
function summarize(email: FullEmail): string {
  const sender = email.fromAddress.split('<')[0].trim().replace(/"/g, '') ||
    email.fromAddress.split('@')[0]
  const subject = email.subject?.trim() || 'a quick note'
  const recipientCount = (email.toAddresses ?? []).length
  const audience =
    recipientCount > 1 ? `the ${recipientCount}-person thread` : 'you'
  return `${sender} sent ${audience} about “${subject}”. Skim the body, then pick an action below — draft a reply, extract tasks for Work, or pop a meeting on the calendar.`
}

/**
 * Pencil row timestamp:
 *   - same day  → "2:34 PM"
 *   - 1–6 d ago → "4d"
 *   - older     → "Mar 12"
 */
function formatRowTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  if (sameDay) {
    return d.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    })
  }
  const ms = now.getTime() - d.getTime()
  const days = Math.floor(ms / 86_400_000)
  if (days < 7) return `${days}d`
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
