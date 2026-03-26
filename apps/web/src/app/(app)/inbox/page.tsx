'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { Search, ArrowUpDown, SlidersHorizontal, Star, Archive, Trash2, Tag, Reply, ReplyAll, Forward, Sparkles } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api-client'
import { cn, formatRelativeTime } from '@/lib/utils'

type Email = {
  id: string
  messageId: string
  fromAddress: string
  toAddresses: string[]
  subject: string
  textBody: string | null
  htmlBody: string | null
  folder: string
  isRead: boolean
  isStarred: boolean
  isDraft: boolean
  sizeBytes: number
  createdAt: string
}

const FOLDER_TABS = [
  { id: 'inbox', label: 'Inbox' },
  { id: 'sent', label: 'Sent' },
  { id: 'drafts', label: 'Drafts' },
  { id: 'starred', label: 'Starred' },
]

export default function InboxPage() {
  const searchParams = useSearchParams()
  const folderParam = searchParams.get('folder') || 'inbox'
  const [emails, setEmails] = useState<Email[]>([])
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null)
  const [activeFolder, setActiveFolder] = useState(folderParam)
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)

  const fetchEmails = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get<{ data: Email[] }>(`/api/v1/inbox/emails?folder=${activeFolder}`)
      setEmails(res.data)
    } catch {} finally {
      setLoading(false)
    }
  }, [activeFolder])

  useEffect(() => { fetchEmails() }, [fetchEmails])

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

  return (
    <div className="flex h-full">
      {/* Email list pane */}
      <div className="flex w-[380px] shrink-0 flex-col border-r border-wm-border">
        {/* Search */}
        <div className="flex items-center gap-2 border-b border-wm-border px-4 py-2.5">
          <Search className="h-4 w-4 text-wm-text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search emails..."
            className="flex-1 bg-transparent font-mono text-xs text-wm-text-primary placeholder:text-wm-text-muted outline-none"
          />
        </div>

        {/* Folder tabs */}
        <div className="flex items-center border-b border-wm-border px-2">
          {FOLDER_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => { setActiveFolder(tab.id); setSelectedEmail(null) }}
              className={cn(
                'cursor-pointer px-3 py-2.5 font-mono text-[11px] transition-colors',
                activeFolder === tab.id
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

          {!loading && emails.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 py-16">
              <p className="font-mono text-sm text-wm-text-muted">No emails yet</p>
              <p className="font-mono text-xs text-wm-text-muted">
                Emails will appear here when received.
              </p>
            </div>
          )}

          {emails.map((email) => (
            <button
              key={email.id}
              onClick={() => selectEmail(email)}
              className={cn(
                'flex w-full cursor-pointer flex-col gap-1 border-b border-wm-border px-4 py-3 text-left transition-colors',
                selectedEmail?.id === email.id
                  ? 'border-l-2 border-l-wm-accent bg-wm-surface'
                  : 'hover:bg-wm-surface-hover',
              )}
            >
              <div className="flex items-center gap-2">
                {!email.isRead && <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-wm-accent" />}
                <span className={cn('flex-1 truncate text-xs', !email.isRead ? 'font-semibold text-wm-text-primary' : 'text-wm-text-secondary')}>
                  {extractSenderName(email.fromAddress)}
                </span>
                <Star
                  className={cn('h-3.5 w-3.5 shrink-0 cursor-pointer', email.isStarred ? 'fill-wm-accent text-wm-accent' : 'text-wm-text-muted')}
                  onClick={(e) => { e.stopPropagation(); handleStar(email.id) }}
                />
                <span className="shrink-0 font-mono text-[10px] text-wm-text-muted">
                  {formatRelativeTime(new Date(email.createdAt))}
                </span>
              </div>
              <span className={cn('truncate text-xs', !email.isRead ? 'font-medium text-wm-text-primary' : 'text-wm-text-secondary')}>
                {email.subject || '(no subject)'}
              </span>
              <span className="truncate font-mono text-[10px] text-wm-text-muted">{extractPreview(email)}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Email preview pane */}
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
            <div className="flex items-center gap-2 border-b border-wm-border px-6 py-3">
              <h2 className="flex-1 truncate text-base font-semibold text-wm-text-primary">
                {selectedEmail.subject || '(no subject)'}
              </h2>
              <Archive className="h-4 w-4 cursor-pointer text-wm-text-muted hover:text-wm-text-secondary" onClick={() => handleArchive(selectedEmail.id)} />
              <Tag className="h-4 w-4 cursor-pointer text-wm-text-muted hover:text-wm-text-secondary" />
              <Trash2 className="h-4 w-4 cursor-pointer text-wm-text-muted hover:text-wm-text-secondary" onClick={() => handleDelete(selectedEmail.id)} />
            </div>

            <div className="flex items-center gap-3 border-b border-wm-border px-6 py-3">
              <Avatar name={extractSenderName(selectedEmail.fromAddress)} size="md" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-wm-text-primary">{extractSenderName(selectedEmail.fromAddress)}</p>
                <p className="font-mono text-[10px] text-wm-text-muted">
                  {selectedEmail.fromAddress} · {new Date(selectedEmail.createdAt).toLocaleString()}
                </p>
              </div>
              <div className="flex gap-1.5">
                <Button variant="secondary" size="sm" icon={<Reply className="h-3.5 w-3.5" />}>Reply</Button>
                <Button variant="secondary" size="sm" icon={<ReplyAll className="h-3.5 w-3.5" />}>Reply All</Button>
                <Button variant="secondary" size="sm" icon={<Forward className="h-3.5 w-3.5" />}>Forward</Button>
              </div>
            </div>

            <div className="flex items-center gap-2 border-b border-wm-border bg-wm-accent/5 px-6 py-2">
              <Sparkles className="h-3.5 w-3.5 text-wm-accent" />
              <span className="font-mono text-[10px] font-semibold text-wm-accent">AI Summary</span>
              <span className="flex-1 truncate font-mono text-[10px] text-wm-text-tertiary">
                {(selectedEmail.textBody || '').slice(0, 100)}...
              </span>
              <button className="cursor-pointer font-mono text-[10px] font-medium text-wm-accent hover:underline">Draft reply</button>
              <button className="cursor-pointer font-mono text-[10px] font-medium text-wm-accent hover:underline">Extract tasks</button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-6">
              {selectedEmail.htmlBody ? (
                <div className="max-w-none text-sm leading-relaxed text-wm-text-secondary" dangerouslySetInnerHTML={{ __html: selectedEmail.htmlBody }} />
              ) : (
                <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed text-wm-text-secondary">
                  {selectedEmail.textBody || 'No content'}
                </pre>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
