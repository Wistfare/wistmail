'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Search, ArrowUpDown, SlidersHorizontal, Star, Archive, Trash2, Tag, Reply, ReplyAll, Forward } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api-client'
import { cn, formatRelativeTime } from '@/lib/utils'

type Email = {
  id: string
  messageId: string
  fromAddress: string
  toAddresses: string[]
  cc?: string[]
  subject: string
  textBody: string | null
  htmlBody: string | null
  folder: string
  isRead: boolean
  isStarred: boolean
  isDraft: boolean
  inReplyTo?: string
  sizeBytes: number
  createdAt: string
}

const FILTER_TABS = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
]

export default function InboxPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const folderParam = searchParams.get('folder') || 'inbox'
  const [emails, setEmails] = useState<Email[]>([])
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null)
  const [activeFilter, setActiveFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)

  const fetchEmails = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get<{ data: Email[] }>(`/api/v1/inbox/emails?folder=${folderParam}`)
      setEmails(res.data)
    } catch {} finally {
      setLoading(false)
    }
  }, [folderParam])

  useEffect(() => { fetchEmails() }, [fetchEmails])

  // Filter emails
  const filteredEmails = emails.filter((email) => {
    if (activeFilter === 'unread' && email.isRead) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      return email.fromAddress.toLowerCase().includes(q) ||
        email.subject.toLowerCase().includes(q) ||
        (email.textBody || '').toLowerCase().includes(q)
    }
    return true
  })

  async function handleStar(emailId: string) {
    try {
      await api.post(`/api/v1/inbox/emails/${emailId}/star`)
      setEmails((prev) => prev.map((e) => (e.id === emailId ? { ...e, isStarred: !e.isStarred } : e)))
      if (selectedEmail?.id === emailId) {
        setSelectedEmail((prev) => prev ? { ...prev, isStarred: !prev.isStarred } : null)
      }
    } catch {}
  }

  async function handleArchive(emailId: string) {
    try {
      await api.post(`/api/v1/inbox/emails/${emailId}/archive`)
      setEmails((prev) => prev.filter((e) => e.id !== emailId))
      if (selectedEmail?.id === emailId) setSelectedEmail(null)
    } catch {}
  }

  async function handleDelete(emailId: string) {
    try {
      await api.post(`/api/v1/inbox/emails/${emailId}/delete`)
      setEmails((prev) => prev.filter((e) => e.id !== emailId))
      if (selectedEmail?.id === emailId) setSelectedEmail(null)
    } catch {}
  }

  async function handleMarkRead(emailId: string) {
    try {
      await api.post(`/api/v1/inbox/emails/${emailId}/read`)
      setEmails((prev) => prev.map((e) => (e.id === emailId ? { ...e, isRead: true } : e)))
    } catch {}
  }

  function selectEmail(email: Email) {
    setSelectedEmail(email)
    if (!email.isRead) handleMarkRead(email.id)
  }

  function extractSenderName(address: string): string {
    if (address.includes('<')) return address.split('<')[0].trim().replace(/"/g, '')
    return address.split('@')[0]
  }

  function extractPreview(email: Email): string {
    return (email.textBody || '').slice(0, 120).replace(/\n/g, ' ')
  }

  // Folder display name
  const folderName = folderParam.charAt(0).toUpperCase() + folderParam.slice(1)

  function handleReply() {
    if (!selectedEmail) return
    const params = new URLSearchParams({
      replyTo: selectedEmail.id,
      to: selectedEmail.fromAddress,
      subject: selectedEmail.subject.startsWith('Re:') ? selectedEmail.subject : `Re: ${selectedEmail.subject}`,
    })
    router.push(`/compose?${params.toString()}`)
  }

  function handleReplyAll() {
    if (!selectedEmail) return
    const allRecipients = [selectedEmail.fromAddress, ...(selectedEmail.toAddresses || []), ...(selectedEmail.cc || [])]
    const unique = [...new Set(allRecipients)]
    const params = new URLSearchParams({
      replyTo: selectedEmail.id,
      to: unique.join(','),
      subject: selectedEmail.subject.startsWith('Re:') ? selectedEmail.subject : `Re: ${selectedEmail.subject}`,
    })
    router.push(`/compose?${params.toString()}`)
  }

  function handleForward() {
    if (!selectedEmail) return
    const params = new URLSearchParams({
      forward: selectedEmail.id,
      subject: selectedEmail.subject.startsWith('Fwd:') ? selectedEmail.subject : `Fwd: ${selectedEmail.subject}`,
    })
    router.push(`/compose?${params.toString()}`)
  }

  function renderEmailBody(email: Email) {
    if (email.htmlBody) {
      const sanitized = email.htmlBody
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/\son\w+="[^"]*"/gi, '')
        .replace(/\son\w+='[^']*'/gi, '')
      return <div className="email-body max-w-none text-sm leading-relaxed text-wm-text-secondary" dangerouslySetInnerHTML={{ __html: sanitized }} />
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
    if (currentLines.length > 0) parts.push({ quoted: currentQuoted, text: currentLines.join('\n') })

    return (
      <div className="text-sm leading-relaxed text-wm-text-secondary">
        {parts.map((part, i) =>
          part.quoted ? (
            <blockquote key={i} className="my-2 border-l-2 border-wm-text-muted/30 pl-3 text-wm-text-muted">
              <pre className="whitespace-pre-wrap font-mono text-xs">{part.text}</pre>
            </blockquote>
          ) : (
            <pre key={i} className="whitespace-pre-wrap font-mono text-sm">{part.text}</pre>
          ),
        )}
      </div>
    )
  }

  return (
    <div className="flex h-full">
      {/* ── Email list pane ── */}
      <div className="flex w-[380px] shrink-0 flex-col border-r border-wm-border">
        {/* Search */}
        <div className="flex items-center gap-2 border-b border-wm-border px-5 py-2.5">
          <Search className="h-4 w-4 text-wm-text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={`Search ${folderName.toLowerCase()}...`}
            className="flex-1 bg-transparent font-mono text-xs text-wm-text-primary placeholder:text-wm-text-muted outline-none"
          />
        </div>

        {/* Folder title + filter tabs */}
        <div className="flex items-center border-b border-wm-border px-5">
          <span className="mr-4 py-2.5 text-sm font-semibold text-wm-text-primary">{folderName}</span>
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveFilter(tab.id)}
              className={cn(
                'cursor-pointer px-3 py-2.5 text-xs transition-colors',
                activeFilter === tab.id
                  ? 'border-b-2 border-wm-accent font-medium text-wm-accent'
                  : 'text-wm-text-muted hover:text-wm-text-secondary',
              )}
            >
              {tab.label}
            </button>
          ))}
          <div className="flex-1" />
          <ArrowUpDown className="h-3.5 w-3.5 cursor-pointer text-wm-text-muted" />
          <SlidersHorizontal className="ml-2 h-3.5 w-3.5 cursor-pointer text-wm-text-muted" />
        </div>

        {/* Email list */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center py-16">
              <div className="h-5 w-5 animate-spin border-2 border-wm-accent border-t-transparent" />
            </div>
          )}

          {!loading && filteredEmails.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 py-16">
              <p className="text-sm text-wm-text-muted">
                {searchQuery ? 'No results found' : activeFilter === 'unread' ? 'No unread emails' : 'No emails yet'}
              </p>
            </div>
          )}

          {filteredEmails.map((email) => (
            <button
              key={email.id}
              onClick={() => selectEmail(email)}
              className={cn(
                'flex w-full cursor-pointer flex-col gap-1.5 border-b border-wm-border px-5 py-3.5 text-left transition-colors',
                selectedEmail?.id === email.id
                  ? 'border-l-2 border-l-wm-accent bg-wm-surface'
                  : 'hover:bg-wm-surface-hover',
              )}
            >
              {/* Top row: dot + sender + star + time */}
              <div className="flex items-center gap-2">
                {!email.isRead && (
                  <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-wm-accent" />
                )}
                <span className={cn(
                  'flex-1 truncate text-[13px]',
                  !email.isRead
                    ? 'font-semibold text-wm-text-primary'
                    : 'font-normal text-wm-text-secondary',
                )}>
                  {extractSenderName(email.fromAddress)}
                </span>
                <Star
                  className={cn(
                    'h-3.5 w-3.5 shrink-0 cursor-pointer',
                    email.isStarred ? 'fill-wm-accent text-wm-accent' : 'text-wm-text-muted',
                  )}
                  onClick={(e) => { e.stopPropagation(); handleStar(email.id) }}
                />
                <span className="shrink-0 font-mono text-[10px] text-wm-text-muted">
                  {formatRelativeTime(new Date(email.createdAt))}
                </span>
              </div>

              {/* Subject */}
              <span className={cn(
                'truncate text-[13px]',
                !email.isRead
                  ? 'font-medium text-wm-text-primary'
                  : 'font-normal text-wm-text-secondary',
              )}>
                {email.subject || '(no subject)'}
              </span>

              {/* Preview */}
              <span className="line-clamp-2 font-mono text-[11px] leading-[1.4] text-wm-text-muted">
                {extractPreview(email)}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Email preview pane ── */}
      <div className="flex flex-1 flex-col">
        {!selectedEmail ? (
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
        ) : (
          <>
            {/* Subject + actions bar */}
            <div className="flex items-center gap-2 border-b border-wm-border px-6 py-3">
              <h2 className="flex-1 truncate text-base font-semibold text-wm-text-primary">
                {selectedEmail.subject || '(no subject)'}
              </h2>
              <Archive className="h-4 w-4 cursor-pointer text-wm-text-muted hover:text-wm-text-secondary" onClick={() => handleArchive(selectedEmail.id)} />
              <Tag className="h-4 w-4 cursor-pointer text-wm-text-muted hover:text-wm-text-secondary" />
              <Trash2 className="h-4 w-4 cursor-pointer text-wm-text-muted hover:text-wm-text-secondary" onClick={() => handleDelete(selectedEmail.id)} />
            </div>

            {/* Sender + reply buttons */}
            <div className="flex items-center gap-3 border-b border-wm-border px-6 py-3">
              <Avatar name={extractSenderName(selectedEmail.fromAddress)} size="md" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-wm-text-primary">{extractSenderName(selectedEmail.fromAddress)}</p>
                <p className="font-mono text-[10px] text-wm-text-muted">
                  {selectedEmail.fromAddress} · {new Date(selectedEmail.createdAt).toLocaleString()}
                </p>
              </div>
              <div className="flex gap-1.5">
                <Button variant="secondary" size="sm" icon={<Reply className="h-3.5 w-3.5" />} onClick={handleReply}>Reply</Button>
                <Button variant="secondary" size="sm" icon={<ReplyAll className="h-3.5 w-3.5" />} onClick={handleReplyAll}>Reply All</Button>
                <Button variant="secondary" size="sm" icon={<Forward className="h-3.5 w-3.5" />} onClick={handleForward}>Forward</Button>
              </div>
            </div>

            {/* Email body */}
            <div className="flex-1 overflow-y-auto px-6 py-6">
              {renderEmailBody(selectedEmail)}
            </div>
          </>
        )}
      </div>

      <style jsx global>{`
        .email-body blockquote { border-left: 2px solid var(--color-wm-text-muted); padding-left: 12px; margin: 8px 0; opacity: 0.7; }
        .email-body img { max-width: 100%; height: auto; }
        .email-body a { color: var(--color-wm-accent); text-decoration: underline; }
        .email-body table { border-collapse: collapse; }
        .email-body td, .email-body th { padding: 4px 8px; }
      `}</style>
    </div>
  )
}
