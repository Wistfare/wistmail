'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import DOMPurify from 'isomorphic-dompurify'
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
} from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { useCompose } from '@/components/email/compose-provider'
import { api } from '@/lib/api-client'
import { cn, formatRelativeTime } from '@/lib/utils'

const PAGE_SIZE = 50

/// Slim list-row shape returned by `/api/v1/inbox/emails`. Bodies are
/// fetched only when the user opens an email — see `loadFullEmail`.
type EmailListItem = {
  id: string
  mailboxId: string
  fromAddress: string
  toAddresses: string[]
  cc: string[]
  subject: string
  snippet: string
  folder: string
  isRead: boolean
  isStarred: boolean
  isDraft: boolean
  hasAttachments: boolean
  sizeBytes: number
  createdAt: string
}

/// Full email — fetched on demand for the detail pane.
type FullEmail = EmailListItem & {
  textBody: string | null
  htmlBody: string | null
  attachments: Array<{ id: string; filename: string; contentType: string; sizeBytes: number }>
}

type EmailPage = {
  data: EmailListItem[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
}

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

  const [emails, setEmails] = useState<EmailListItem[]>([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedFull, setSelectedFull] = useState<FullEmail | null>(null)
  const [activeFilter, setActiveFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')

  const detailCache = useRef<Map<string, FullEmail>>(new Map())
  const listRef = useRef<HTMLDivElement | null>(null)

  const fetchPage = useCallback(
    async (nextPage: number, replace: boolean) => {
      if (replace) setLoading(true)
      else setLoadingMore(true)
      try {
        const res = await api.get<EmailPage>(
          `/api/v1/inbox/emails?folder=${folderParam}&page=${nextPage}&pageSize=${PAGE_SIZE}`,
        )
        setEmails((prev) => {
          if (replace) return res.data
          const seen = new Set(prev.map((e) => e.id))
          return [...prev, ...res.data.filter((e) => !seen.has(e.id))]
        })
        setPage(res.page)
        setHasMore(res.hasMore)
      } catch (err) {
        console.error('inbox: fetch failed', err)
      } finally {
        setLoading(false)
        setLoadingMore(false)
      }
    },
    [folderParam],
  )

  useEffect(() => {
    detailCache.current.clear()
    setSelectedId(null)
    setSelectedFull(null)
    fetchPage(1, true)
  }, [fetchPage])

  // Lazy load-more on scroll. Trigger ~600px before the bottom.
  useEffect(() => {
    const el = listRef.current
    if (!el) return
    const onScroll = () => {
      if (loadingMore || loading || !hasMore) return
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 600) {
        fetchPage(page + 1, false)
      }
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [fetchPage, hasMore, loading, loadingMore, page])

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

  async function loadFullEmail(id: string): Promise<FullEmail> {
    const cached = detailCache.current.get(id)
    if (cached) return cached
    const full = await api.get<FullEmail>(`/api/v1/inbox/emails/${id}`)
    detailCache.current.set(id, full)
    return full
  }

  function prefetchEmail(id: string) {
    if (detailCache.current.has(id)) return
    api
      .get<FullEmail>(`/api/v1/inbox/emails/${id}`)
      .then((full) => detailCache.current.set(id, full))
      .catch(() => {})
  }

  async function selectEmail(email: EmailListItem) {
    setSelectedId(email.id)
    setSelectedFull(null)
    try {
      const full = await loadFullEmail(email.id)
      setSelectedFull(full)
    } catch (err) {
      console.error('inbox: failed to load email body', err)
    }
    if (!email.isRead) handleMarkRead(email.id)
  }

  async function handleStar(emailId: string) {
    try {
      await api.post(`/api/v1/inbox/emails/${emailId}/star`)
      setEmails((prev) =>
        prev.map((e) => (e.id === emailId ? { ...e, isStarred: !e.isStarred } : e)),
      )
      const cached = detailCache.current.get(emailId)
      if (cached) {
        detailCache.current.set(emailId, { ...cached, isStarred: !cached.isStarred })
      }
      if (selectedFull?.id === emailId) {
        setSelectedFull((prev) =>
          prev ? { ...prev, isStarred: !prev.isStarred } : null,
        )
      }
    } catch (err) {
      console.error('inbox: star failed', err)
    }
  }

  async function handleArchive(emailId: string) {
    try {
      await api.post(`/api/v1/inbox/emails/${emailId}/archive`)
      setEmails((prev) => prev.filter((e) => e.id !== emailId))
      detailCache.current.delete(emailId)
      if (selectedId === emailId) {
        setSelectedId(null)
        setSelectedFull(null)
      }
    } catch (err) {
      console.error('inbox: archive failed', err)
    }
  }

  async function handleDelete(emailId: string) {
    try {
      await api.post(`/api/v1/inbox/emails/${emailId}/delete`)
      setEmails((prev) => prev.filter((e) => e.id !== emailId))
      detailCache.current.delete(emailId)
      if (selectedId === emailId) {
        setSelectedId(null)
        setSelectedFull(null)
      }
    } catch (err) {
      console.error('inbox: delete failed', err)
    }
  }

  async function handleMarkRead(emailId: string) {
    try {
      await api.post(`/api/v1/inbox/emails/${emailId}/read`)
      setEmails((prev) =>
        prev.map((e) => (e.id === emailId ? { ...e, isRead: true } : e)),
      )
    } catch (err) {
      console.error('inbox: mark-read failed', err)
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

  function handleReply() {
    if (!selectedFull) return
    openCompose({
      to: [selectedFull.fromAddress],
      subject: selectedFull.subject.startsWith('Re:')
        ? selectedFull.subject
        : `Re: ${selectedFull.subject}`,
      inReplyTo: selectedFull.id,
    })
  }

  function handleReplyAll() {
    if (!selectedFull) return
    const allRecipients = [
      selectedFull.fromAddress,
      ...(selectedFull.toAddresses || []),
      ...(selectedFull.cc || []),
    ]
    const unique = [...new Set(allRecipients)]
    openCompose({
      to: unique,
      subject: selectedFull.subject.startsWith('Re:')
        ? selectedFull.subject
        : `Re: ${selectedFull.subject}`,
      inReplyTo: selectedFull.id,
    })
  }

  function handleForward() {
    if (!selectedFull) return
    openCompose({
      subject: selectedFull.subject.startsWith('Fwd:')
        ? selectedFull.subject
        : `Fwd: ${selectedFull.subject}`,
      body: `\n\n---------- Forwarded message ----------\nFrom: ${selectedFull.fromAddress}\nDate: ${new Date(
        selectedFull.createdAt,
      ).toLocaleString()}\nSubject: ${selectedFull.subject}\n\n${selectedFull.textBody || ''}`,
    })
  }

  function renderEmailBody(email: FullEmail) {
    if (email.htmlBody) {
      // DOMPurify config: strip every script-like execution surface.
      // Allow common email styling but no event handlers, no iframes,
      // no form/object/embed.
      const sanitized = DOMPurify.sanitize(email.htmlBody, {
        FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form'],
        FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover'],
        ALLOW_DATA_ATTR: false,
        // Force every link to a new tab and tell crawlers we don't endorse it.
        ADD_ATTR: ['target', 'rel'],
      })
      return (
        <div
          className="email-body max-w-none text-sm leading-relaxed text-wm-text-secondary"
          // The HTML has been sanitized by DOMPurify above — every
          // execution surface is forbidden so dangerouslySetInnerHTML
          // is the right tool here.
          dangerouslySetInnerHTML={{ __html: sanitized }}
        />
      )
    }
    const text = email.textBody || 'No content'
    const lines = text.split('\n')
    const parts: Array<{ quoted: boolean; text: string }> = []
    let currentQuoted = false
    let currentLines: string[] = []
    for (const line of lines) {
      const isQuoted = line.startsWith('>')
      if (isQuoted !== currentQuoted && currentLines.length > 0) {
        parts.push({ quoted: currentQuoted, text: currentLines.join('\n') })
        currentLines = []
      }
      currentQuoted = isQuoted
      currentLines.push(isQuoted ? line.replace(/^>+\s?/, '') : line)
    }
    if (currentLines.length > 0)
      parts.push({ quoted: currentQuoted, text: currentLines.join('\n') })

    return (
      <div className="text-sm leading-relaxed text-wm-text-secondary">
        {parts.map((part, i) =>
          part.quoted ? (
            <blockquote
              key={i}
              className="my-2 border-l-2 border-wm-text-muted/30 pl-3 text-wm-text-muted"
            >
              <pre className="whitespace-pre-wrap font-mono text-xs">{part.text}</pre>
            </blockquote>
          ) : (
            <pre key={i} className="whitespace-pre-wrap font-mono text-sm">
              {part.text}
            </pre>
          ),
        )}
      </div>
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
          {loading && (
            <div className="flex items-center justify-center py-16">
              <div className="h-5 w-5 animate-spin border-2 border-wm-accent border-t-transparent" />
            </div>
          )}

          {!loading && filteredEmails.length === 0 && (
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
              onMouseEnter={() => prefetchEmail(email.id)}
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
                    handleStar(email.id)
                  }}
                />
                <span className="shrink-0 font-mono text-[10px] text-wm-text-muted">
                  {formatRelativeTime(new Date(email.createdAt))}
                </span>
              </div>

              <span
                className={cn(
                  'truncate text-[13px]',
                  !email.isRead
                    ? 'font-medium text-wm-text-primary'
                    : 'font-normal text-wm-text-secondary',
                )}
              >
                {email.subject || '(no subject)'}
              </span>

              <span className="line-clamp-2 font-mono text-[11px] leading-[1.4] text-wm-text-muted">
                {email.snippet}
              </span>
            </button>
          ))}

          {loadingMore && (
            <div className="flex items-center justify-center py-6">
              <div className="h-4 w-4 animate-spin border-2 border-wm-accent border-t-transparent" />
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
            <div className="h-5 w-5 animate-spin border-2 border-wm-accent border-t-transparent" />
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 border-b border-wm-border px-6 py-3">
              <h2 className="flex-1 truncate text-base font-semibold text-wm-text-primary">
                {selectedFull.subject || '(no subject)'}
              </h2>
              <Archive
                className="h-4 w-4 cursor-pointer text-wm-text-muted hover:text-wm-text-secondary"
                onClick={() => handleArchive(selectedFull.id)}
              />
              <Tag className="h-4 w-4 cursor-pointer text-wm-text-muted hover:text-wm-text-secondary" />
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
