'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Search,
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
  Mail,
  MessageSquare,
  MoreHorizontal,
} from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { useCompose } from '@/components/email/compose-provider'
import { EmailBody } from '@/components/email/email-body'
import { LabelAssignPopover } from '@/components/email/label-assign-popover'
import { AttachmentsStrip } from '@/components/email/attachments-strip'
import { EmailRowV3 } from '@/components/email/email-row-v3'
import { InboxSectionHeader } from '@/components/email/inbox-section-header'
import { NewDropdown } from '@/components/email/new-dropdown'
import { ReadingEmpty } from '@/components/email/reading-empty'
import {
  InlineComposer,
  type InlineComposerMode,
  type RecipientChip,
} from '@/components/email/inline-composer'
import {
  FeedListSkeleton,
  EmailReadingSkeleton,
} from '@/components/email/feed-skeletons'
import { ChatThreadView } from '@/components/chat/chat-thread-view'
import { TodayPanel, type TodayEvent } from '@/components/email/today-panel'
import {
  rangeForWeek,
  useEventsInRange,
  type CalendarEvent,
} from '@/lib/event-queries'
import { api } from '@/lib/api-client'
import { useToast } from '@/components/ui/toast'
import { cn, formatRelativeTime } from '@/lib/utils'
import {
  type FullEmail,
  useArchive,
  useDelete,
  useEmailDetail,
  useEmailThread,
  useFolderRetention,
  useMarkRead,
  usePurge,
  useSnooze,
  useToggleStar,
} from '@/lib/email-queries'
import {
  feedItemDisplayName,
  groupFeedBySection,
  useFeedList,
  type FeedItem,
  type FeedKind,
} from '@/lib/feed-queries'

export default function InboxPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { openCompose } = useCompose()
  const folderParam = searchParams.get('folder') || 'inbox'
  /// `?kind=` overrides the segmented-control default. Used by:
  ///   - /chat redirect      → /inbox?kind=chats
  ///   - command palette etc.
  const kindParam = searchParams.get('kind')
  /// `?chat=<id>` deep-links the inline chat reading pane. Used by:
  ///   - /chat/<id> redirect → /inbox?chat=<id>
  ///   - push notifications  → /inbox?chat=<id>
  const chatParam = searchParams.get('chat')

  const [selectedId, setSelectedId] = useState<string | null>(null)
  /// Selected chat conversation. Mutually exclusive with selectedId
  /// (email) — the right reading pane renders one or the other based
  /// on which is non-null.  Stored as a plain id; the ChatThreadView
  /// hydrates the conversation summary from the cached
  /// useConversations() result.
  const [selectedChatId, setSelectedChatId] = useState<string | null>(
    chatParam,
  )
  /// Pencil InboxV3 segmented control filters the unified feed:
  ///   ALL   → emails + chats
  ///   MAIL  → emails only
  ///   CHATS → conversations only (direct + group)
  /// All three modes stay on /inbox — there is no separate chat
  /// screen; the feed is a single source of truth.
  const [contentType, setContentType] = useState<FeedKind>(
    kindParam === 'mail' || kindParam === 'chats' ? kindParam : 'all',
  )
  /// Inline composer state — Pencil V3 puts reply / reply-all /
  /// forward right inside the thread reading pane (Components/V3-
  /// ComposerVariants).  When `composerMode` is set we render the
  /// InlineComposer beneath the email body; the floating popup is
  /// reserved for the "+ NEW" → "New email" creation flow only.
  const [composerMode, setComposerMode] = useState<InlineComposerMode | null>(
    null,
  )
  const [composerTo, setComposerTo] = useState<RecipientChip[]>([])
  const [composerCc, setComposerCc] = useState<RecipientChip[]>([])
  const [composerSubject, setComposerSubject] = useState<string>('')
  const [composerBody, setComposerBody] = useState<string>('')

  // Sync external URL changes to internal state — covers the case
  // where the user uses the back button to return to a deep-linked
  // chat after viewing something else.
  useEffect(() => {
    if (chatParam && chatParam !== selectedChatId) {
      setSelectedChatId(chatParam)
      setSelectedId(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatParam])
  const listRef = useRef<HTMLDivElement | null>(null)

  // Cache-driven data: feed (paginated) + selected detail.
  const list = useFeedList({ folder: folderParam, kind: contentType })
  const detail = useEmailDetail(selectedId)
  const selectedFull = detail.data ?? null

  // Optimistic mutation hooks.
  const star = useToggleStar()
  const markRead = useMarkRead()
  const archive = useArchive()
  const remove = useDelete()
  const purge = usePurge()
  // Trash/Spam retention banner — Pencil V3 doesn't surface it on the
  // main inbox view; we only render it on the folders that actually
  // auto-purge. The folder query stays idle on /inbox.
  const cleanableFolder = folderParam === 'trash' || folderParam === 'spam'
  const retention = useFolderRetention(
    (cleanableFolder ? folderParam : 'trash') as 'trash' | 'spam',
  )
  const snooze = useSnooze()
  const toast = useToast()
  const [snoozeOpen, setSnoozeOpen] = useState(false)

  // Reset both selection slots when the folder changes — chat or
  // email, whichever was active. Closes any open inline composer too
  // so the user doesn't carry a half-typed reply across folders.
  useEffect(() => {
    setSelectedId(null)
    setSelectedChatId(null)
    setComposerMode(null)
  }, [folderParam])

  // When the user picks a different email, drop any open inline
  // composer for the previous one.
  useEffect(() => {
    setComposerMode(null)
  }, [selectedId])

  // Flatten the infinite-query pages into a single FeedItem array.
  // Items are already chronologically merged server-side; the client
  // just concatenates pages.
  const items: FeedItem[] = useMemo(() => {
    if (!list.data) return []
    return list.data.pages.flatMap((p) => p.data)
  }, [list.data])

  /// Email-only slice for backwards-compat where the existing code
  /// reaches into the cache (mark-read mutations, keyboard shortcuts
  /// keyed on the selected id, etc). Chat rows never bleed into this
  /// list.
  const emails = useMemo(
    () => items.filter((it): it is Extract<FeedItem, { kind: 'email' }> => it.kind === 'email'),
    [items],
  )

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

  // Pencil InboxV3 doesn't show client-side filter pills — `kind` on
  // the segmented control is the only filter and it's applied
  // server-side. We feed the raw merged stream straight through to
  // section grouping; search lives on /search.
  const filteredItems = items

  /// Group merged feed items into Today / Yesterday / This week /
  /// Earlier bands so the list pane gets the V3 section dividers.
  /// Pencil reference: `InboxV3.sec1` / `sec2` (`TB36x`).
  const sections = useMemo(
    () => groupFeedBySection(filteredItems),
    [filteredItems],
  )

  /// "23 UNREAD · 2 MENTIONS" subtitle on the inbox header. The
  /// server returns the per-kind unread tally on every page; we read
  /// the freshest page so the count refreshes as the user toggles
  /// the filter.
  const unreadCount = useMemo(() => {
    const pages = list.data?.pages
    if (!pages || pages.length === 0) return 0
    return pages[pages.length - 1].unreadCount
  }, [list.data])

  /// Today's events feeding the right-hand `TodayPanel` (Pencil
  /// `InboxV3.TodayRail`). Only show on the actual `inbox` folder; the
  /// other folders (sent / drafts / trash etc) keep the 2-column layout
  /// from before.
  const showTodayRail = folderParam === 'inbox'
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

  /// "COMING UP" surfaces the next handful of events that fall AFTER
  /// today, ordered chronologically. Pencil's empty TodayRail
  /// (`Syj0y.eTrSec`) shows a single row but our data may produce
  /// more — TodayPanel slices to 3.
  const comingUpEvents = useMemo<TodayEvent[]>(() => {
    if (!todayEvents.data) return []
    const tomorrow = new Date()
    tomorrow.setHours(0, 0, 0, 0)
    tomorrow.setDate(tomorrow.getDate() + 1)
    return todayEvents.data
      .filter((e: CalendarEvent) => new Date(e.startAt) >= tomorrow)
      .sort(
        (a: CalendarEvent, b: CalendarEvent) =>
          new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
      )
      .slice(0, 3)
      .map((e: CalendarEvent) => ({
        id: e.id,
        title: e.title,
        startsAt: e.startAt,
        endsAt: e.endAt,
        location: e.location ?? undefined,
        meetingUrl: e.meetingLink ?? undefined,
      }))
  }, [todayEvents.data])

  /// Selecting an email or a chat row opens the matching reading
  /// pane in the right column.  The two selection states are mutually
  /// exclusive — picking one clears the other so the right pane only
  /// ever renders a single conversation/email at a time.
  function selectFeedItem(item: FeedItem) {
    if (item.kind === 'email') {
      setSelectedChatId(null)
      setSelectedId(item.id)
      if (!item.isRead) markRead.mutate({ id: item.id })
      return
    }
    // chat-direct or chat-group — render the ChatThreadView inline.
    setSelectedId(null)
    setSelectedChatId(item.id)
  }

  /// Star toggling is mail-only — chat rows have no star state today.
  /// Keep the helper narrow so the type system enforces it.
  function handleStarItem(email: Extract<FeedItem, { kind: 'email' }>) {
    star.mutate({ id: email.id })
  }

  // Global keyboard shortcuts. Modelled on Gmail so muscle memory
  // transfers. Events from text inputs / contentEditable are
  // ignored so typing in compose doesn't eat a `c` as "compose"
  // or `e` as "archive".  Pencil V3 doesn't ship row-level multi-
  // select or an inline search, so the legacy `/`, `x`, and Esc
  // hooks for those affordances are gone.
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
      if (isTypingSurface(e.target)) return

      switch (e.key) {
        case 'j': {
          // j/k navigate the EMAIL portion of the feed only — chat
          // rows don't open in the right pane yet, so stepping
          // through them doesn't make sense until commit 3 lands.
          if (emails.length === 0) return
          const idx = selectedId
            ? emails.findIndex((em) => em.id === selectedId)
            : -1
          const next = idx < 0 ? 0 : Math.min(idx + 1, emails.length - 1)
          selectFeedItem(emails[next])
          e.preventDefault()
          return
        }
        case 'k': {
          if (emails.length === 0) return
          const idx = selectedId
            ? emails.findIndex((em) => em.id === selectedId)
            : 0
          const prev = idx <= 0 ? 0 : idx - 1
          selectFeedItem(emails[prev])
          e.preventDefault()
          return
        }
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
            if (em) handleStarItem(em)
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
  }, [emails, selectedId, selectedFull])

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

  /// Reply / reply-all / forward all open the inline composer in the
  /// same column as the email body, matching Pencil's V3 thread
  /// design — no more floating popup for these flows.  The floating
  /// FloatingCompose only appears for the "+ NEW" → "New email"
  /// creation flow now.
  function handleReply() {
    if (!selectedFull) return
    setComposerMode('reply')
    setComposerTo([{ email: extractAddress(selectedFull.fromAddress) }])
    setComposerCc([])
    setComposerSubject(prefixSubject('Re:', selectedFull.subject))
    setComposerBody(quotedReplyBody(selectedFull))
  }

  function handleReplyAll() {
    if (!selectedFull) return
    const sender = extractAddress(selectedFull.fromAddress)
    const others = new Set<string>([
      ...(selectedFull.toAddresses ?? []).map(extractAddress),
      ...(selectedFull.cc ?? []).map(extractAddress),
    ])
    others.delete(sender)
    setComposerMode('reply-all')
    setComposerTo([{ email: sender }])
    setComposerCc(
      [...others]
        .filter((a) => a.length > 0)
        .map((email) => ({ email })),
    )
    setComposerSubject(prefixSubject('Re:', selectedFull.subject))
    setComposerBody(quotedReplyBody(selectedFull))
  }

  function handleForward() {
    if (!selectedFull) return
    setComposerMode('forward')
    setComposerTo([])
    setComposerCc([])
    setComposerSubject(prefixSubject('Fwd:', selectedFull.subject))
    setComposerBody(
      `\n\n---------- Forwarded message ----------\nFrom: ${selectedFull.fromAddress}\nDate: ${new Date(
        selectedFull.createdAt,
      ).toLocaleString()}\nSubject: ${selectedFull.subject}\nTo: ${(selectedFull.toAddresses ?? []).join(', ')}${
        (selectedFull.cc ?? []).length > 0
          ? `\nCc: ${(selectedFull.cc ?? []).join(', ')}`
          : ''
      }\n\n${selectedFull.textBody || ''}`,
    )
  }

  function closeComposer() {
    setComposerMode(null)
    setComposerTo([])
    setComposerCc([])
    setComposerSubject('')
    setComposerBody('')
  }

  /// Sends the inline composer's draft via the existing compose API.
  /// We reuse `/api/v1/inbox/compose` so the network surface is
  /// unchanged — only the UI moved from popup to inline.
  async function sendInlineComposer(input: {
    to: RecipientChip[]
    cc?: RecipientChip[]
    bcc?: RecipientChip[]
    subject?: string
    body: string
  }) {
    if (!selectedFull) {
      closeComposer()
      return
    }
    await api.post('/api/v1/inbox/compose', {
      fromAddress: undefined, // server picks the user's primary mailbox
      toAddresses: input.to.map((c) => c.email),
      cc: input.cc?.map((c) => c.email),
      bcc: input.bcc?.map((c) => c.email),
      subject: input.subject ?? composerSubject,
      textBody: input.body,
      inReplyTo: composerMode === 'forward' ? undefined : selectedFull.id,
      send: true,
    })
    toast.show({ message: 'Sent.' })
    closeComposer()
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
  ///   [All · 23] [Mail] [Chats]   [🔍]
  /// All three modes stay on /inbox — clicking CHATS just toggles
  /// the `kind` filter on the unified feed query, the same way ALL
  /// and MAIL do.
  function onContentTypeChange(next: FeedKind) {
    setContentType(next)
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
            {/* NewDropdown — Pencil composePill (`vsugi`) + newDropdown
                (`cZcJ2`).  The chevron-down on the pill opens a 288-px
                menu with three create actions (New email / New chat /
                New group) plus their kbd shortcuts. */}
            <NewDropdown context={contentType} />
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
            active={contentType === 'chats'}
            onClick={() => onContentTypeChange('chats')}
            icon={<MessageSquare style={{ width: 12, height: 12 }} />}
          >
            CHATS
          </SegPill>
          <span style={{ flex: 1 }} />
          {/* Round search button — Pencil `Q60pJN`. Pencil's static
              InboxV3 frame doesn't show any inline search UI in the
              list pane; the round button is the entry point and we
              route to the dedicated `/search` page where the input
              already lives. */}
          <button
            type="button"
            onClick={() => router.push('/search')}
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

        {/* Pencil InboxV3 (`TB36x`) flows directly from the segmented
            control into the TODAY section header — there is no inline
            search input row, no read-status filter pills, and no
            bulk-action toolbar. We honour that and only surface the
            destructive-folder retention notice (still useful on
            /inbox?folder=trash etc., never visible on the main inbox
            view). */}

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
          {list.isPending && <FeedListSkeleton rows={6} />}

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

          {!list.isPending && !list.isError && filteredItems.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 py-16">
              <p className="text-sm text-wm-text-muted">
                {contentType === 'mail'
                  ? 'No emails yet'
                  : contentType === 'chats'
                    ? 'No conversations yet'
                    : 'Your inbox is empty'}
              </p>
            </div>
          )}

          {/* Feed items grouped into V3 date sections. Each section
              mixes mail + chat rows already merged server-side; we
              just dispatch on `kind` to pick the right row payload
              and click handler. EmailRowV3 renders both kinds via its
              tag prop (MAIL / CHAT / CHANNEL). */}
          {sections.map((sec) => (
            <div key={sec.label}>
              <InboxSectionHeader label={sec.label} count={sec.items.length} />
              {sec.items.map((item) => {
                if (item.kind === 'email') {
                  return (
                    <EmailRowV3
                      key={`email-${item.id}`}
                      email={{
                        id: item.id,
                        fromAddress: item.fromAddress,
                        displayName: item.displayName,
                        subject: item.subject,
                        snippet: item.snippet,
                        timeLabel: formatRowTime(item.activityAt),
                        isRead: item.isRead,
                        isStarred: item.isStarred,
                        hasAttachments: item.hasAttachments,
                        tag: 'MAIL',
                        labels: item.labels ?? [],
                      }}
                      selected={selectedId === item.id}
                      onClick={() => selectFeedItem(item)}
                      onToggleStar={() => handleStarItem(item)}
                      trailing={
                        <SendStatusPill
                          status={item.status}
                          onRetry={() => handleRetrySend(item.id)}
                        />
                      }
                    />
                  )
                }
                // chat-direct or chat-group — same row shape, no
                // subject line (Pencil row3/row4 omit the subject for
                // chat rows). Display name reads from the item helper
                // so groups fall back to participant lists.
                return (
                  <EmailRowV3
                    key={`${item.kind}-${item.id}`}
                    email={{
                      id: item.id,
                      fromAddress: '',
                      displayName: feedItemDisplayName(item),
                      subject: '',
                      snippet: item.snippet,
                      timeLabel: formatRowTime(item.activityAt),
                      isRead: item.isRead,
                      isStarred: false,
                      hasAttachments: false,
                      tag: item.tag,
                    }}
                    selected={selectedChatId === item.id}
                    onClick={() => selectFeedItem(item)}
                  />
                )
              })}
            </div>
          ))}
          {list.isFetchingNextPage && (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-4 w-4 animate-spin text-wm-accent" />
            </div>
          )}
        </div>
      </div>

      {/* ── Email preview pane ──
          `min-w-0` is critical: without it a long unbreakable subject
          or URL inside the body will push this flex-child wider than
          its allotted space, blowing out the layout and forcing
          horizontal scroll on the whole page.  `overflow-hidden` on
          the column then clips any stray inline content (HTML emails
          with absolutely-positioned elements, etc.). */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {selectedChatId ? (
          // Chat reading pane — same column as the email reading
          // pane, swapped via the discriminated selection state.
          <ChatThreadView
            conversationId={selectedChatId}
            onBack={() => setSelectedChatId(null)}
          />
        ) : !selectedId ? (
          <ReadingEmpty
            unreadCount={unreadCount}
            onCompose={() => openCompose()}
            onNewChat={() => router.push('/chat/new')}
            onNewGroup={() => router.push('/chat/new?kind=group')}
            onSearch={() => router.push('/search')}
          />
        ) : !selectedFull ? (
          <EmailReadingSkeleton />
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
                  style={{
                    fontSize: 26,
                    lineHeight: 1.25,
                    // Long unbreakable strings (e.g. "[GitHub] Your
                    // personal access token (classic)…") have no
                    // natural break opportunities — `overflow-wrap:
                    // anywhere` lets the browser break inside the
                    // word so the title stays inside the column.
                    overflowWrap: 'anywhere',
                  }}
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
              {/* The Pencil V3 AI Brief block (`Hyivo`) — sparkles
                  header, summary paragraph, and the three action chips
                  (Draft reply / Extract tasks / Schedule call) — is
                  intentionally hidden for now.  The AIBrief component
                  itself is preserved in `components/email/ai-brief.tsx`
                  so it can be wired back in once the AI pipeline emits
                  per-thread summaries. Until then the reading pane
                  shows the email body directly. */}
              {renderEmailBody(selectedFull)}
            </div>

            {/* Inline composer — Pencil V3 anchors `composerWrap` at
                the BOTTOM of the reading column (InboxV3-Thread
                `z5ASRq`, padding [0,28,20,28]).  Living outside the
                scrolling body slot keeps the composer anchored as the
                user scrolls long threads — they don't have to scroll
                past the body to find their reply. */}
            {composerMode && (
              <div
                style={{
                  padding: '0 28px 20px 28px',
                  borderTop: '1px solid var(--color-wm-border)',
                  paddingTop: 16,
                }}
              >
                <InlineComposer
                  mode={composerMode}
                  to={composerTo}
                  cc={composerCc}
                  subject={composerSubject}
                  initialBody={composerBody}
                  onCancel={closeComposer}
                  onSend={sendInlineComposer}
                />
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Right rail: Today panel ── only on the inbox folder. */}
      {showTodayRail && (
        <TodayPanel
          events={todayPanelEvents}
          comingUp={comingUpEvents}
          onAddTask={() => router.push('/work')}
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
  status: 'idle' | 'sending' | 'sent' | 'failed' | 'rate_limited'
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

// Pencil InboxV3 doesn't ship multi-row selection or a bulk-action
// toolbar — both lived only in the legacy V2 inbox. The supporting
// types / constants / components (BulkActionVars, MOVE_TARGETS,
// BulkActionToolbar, MoveMenu, LabelMenu, BulkBtn) and their lucide
// icons (CheckSquare, Square, MailOpen, FolderInput, X) were all
// dead weight after the V3 chrome went in, so we removed them in
// one pass. Single-row archive/delete/snooze still work via the
// reading-pane toolbar and keyboard shortcuts (e/#/Delete/s).

// Hidden helper to keep the diff narrow until we delete everything below.
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
