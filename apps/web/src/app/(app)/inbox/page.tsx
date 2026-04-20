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
} from 'lucide-react'
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
import { useLabelsForEmail } from '@/lib/labels'
import { cn, formatRelativeTime } from '@/lib/utils'
import {
  type EmailListItem,
  type FullEmail,
  useArchive,
  useDelete,
  useEmailDetail,
  useInboxList,
  useMarkRead,
  useToggleStar,
} from '@/lib/email-queries'

const FILTER_TABS = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'primary', label: 'Primary' },
  { id: 'updates', label: 'Updates' },
]

export default function InboxPage() {
  const searchParams = useSearchParams()
  const { openCompose } = useCompose()
  const folderParam = searchParams.get('folder') || 'inbox'

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [activeFilter, setActiveFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const listRef = useRef<HTMLDivElement | null>(null)

  // Cache-driven data: list (paginated) + selected detail.
  const list = useInboxList(folderParam)
  const detail = useEmailDetail(selectedId)
  const selectedFull = detail.data ?? null

  // Optimistic mutation hooks.
  const star = useToggleStar()
  const markRead = useMarkRead()
  const archive = useArchive()
  const remove = useDelete()

  // Reset selection when the folder changes.
  useEffect(() => {
    setSelectedId(null)
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
    setSelectedId(email.id)
    if (!email.isRead) markRead.mutate({ id: email.id })
  }

  function handleStar(email: EmailListItem) {
    star.mutate(email)
  }

  function handleArchive(emailId: string) {
    archive.mutate({ id: emailId })
    if (selectedId === emailId) setSelectedId(null)
  }

  function handleDelete(emailId: string) {
    remove.mutate({ id: emailId })
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
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={`Search ${folderName.toLowerCase()}...`}
            className="flex-1 bg-transparent font-mono text-xs text-wm-text-primary placeholder:text-wm-text-muted outline-none"
          />
        </div>

        <div className="flex items-center border-b border-wm-border px-5 py-3">
          <span className="text-sm font-semibold text-wm-text-primary">{folderName}</span>
          <div className="flex-1" />
          <ArrowUpDown className="h-3.5 w-3.5 cursor-pointer text-wm-text-muted" />
          <SlidersHorizontal className="ml-3 h-3.5 w-3.5 cursor-pointer text-wm-text-muted" />
        </div>

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
                'flex w-full cursor-pointer flex-col gap-1.5 border-b border-wm-border px-5 py-3.5 text-left transition-colors',
                selectedId === email.id
                  ? 'border-l-2 border-l-wm-accent bg-wm-surface'
                  : 'hover:bg-wm-surface-hover',
              )}
            >
              <div className="flex items-center gap-2">
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
              <RowLabels emailId={email.id} />
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
              <LabelAssignPopover
                emailId={selectedFull.id}
                trigger={
                  <Tag className="h-4 w-4 cursor-pointer text-wm-text-muted hover:text-wm-text-secondary" />
                }
              />
              <Trash2
                className="h-4 w-4 cursor-pointer text-wm-text-muted hover:text-wm-text-secondary"
                onClick={() => handleDelete(selectedFull.id)}
              />
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
/// when the email has no labels (the common case). Uses a separate
/// component so the row-level component doesn't need to be a
/// QueryClient consumer for unrelated reasons.
function RowLabels({ emailId }: { emailId: string }) {
  const { data } = useLabelsForEmail(emailId)
  if (!data || data.length === 0) return null
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {data.map((l) => (
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
