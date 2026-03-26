'use client'

import { useState } from 'react'
import { Search as SearchIcon, X, Calendar, Paperclip, Sparkles } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { api } from '@/lib/api-client'
import { cn, formatRelativeTime } from '@/lib/utils'

type Email = {
  id: string
  fromAddress: string
  subject: string
  textBody: string | null
  isRead: boolean
  isStarred: boolean
  createdAt: string
}

export default function SearchPage() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Email[]>([])
  const [searched, setSearched] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSearch(e?: React.FormEvent) {
    e?.preventDefault()
    if (!query.trim()) return

    setLoading(true)
    setSearched(true)
    try {
      const res = await api.get<{ data: Email[] }>(`/api/v1/inbox/search?q=${encodeURIComponent(query)}`)
      setResults(res.data)
    } catch {} finally {
      setLoading(false)
    }
  }

  function extractSenderName(address: string): string {
    if (address.includes('<')) return address.split('<')[0].trim().replace(/"/g, '')
    return address.split('@')[0]
  }

  return (
    <div className="flex h-full flex-col p-8">
      <h1 className="mb-6 text-2xl font-semibold text-wm-text-primary">Search</h1>

      {/* Search input */}
      <form onSubmit={handleSearch} className="mb-4 flex items-center gap-3 border-2 border-wm-accent bg-wm-surface px-5 py-3.5">
        <SearchIcon className="h-5 w-5 text-wm-accent" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search emails by subject, sender, or content..."
          className="flex-1 bg-transparent text-base text-wm-text-primary placeholder:text-wm-text-muted outline-none"
          autoFocus
        />
        {query && (
          <button type="button" onClick={() => { setQuery(''); setResults([]); setSearched(false) }} className="cursor-pointer text-wm-text-muted hover:text-wm-text-secondary">
            <X className="h-4 w-4" />
          </button>
        )}
      </form>

      {/* Filter chips */}
      <div className="mb-6 flex gap-2">
        <button className="flex cursor-pointer items-center gap-1.5 border border-wm-border px-3 py-1.5">
          <Calendar className="h-3 w-3 text-wm-text-muted" />
          <span className="font-mono text-[11px] text-wm-text-secondary">Any time</span>
        </button>
        <button className="flex cursor-pointer items-center gap-1.5 border border-wm-border px-3 py-1.5">
          <Paperclip className="h-3 w-3 text-wm-text-muted" />
          <span className="font-mono text-[11px] text-wm-text-secondary">Has attachment</span>
        </button>
        <button className="flex cursor-pointer items-center gap-1.5 border border-wm-border px-3 py-1.5">
          <span className="font-mono text-[11px] text-wm-text-secondary">Unread only</span>
        </button>
        <div className="flex-1" />
        <div className="flex items-center gap-1.5 bg-wm-accent/10 px-3 py-1.5">
          <Sparkles className="h-3 w-3 text-wm-accent" />
          <span className="font-mono text-[10px] text-wm-accent">Try AI search: &quot;What did Alex say about the API?&quot;</span>
        </div>
      </div>

      {/* Results */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="h-5 w-5 animate-spin border-2 border-wm-accent border-t-transparent" />
        </div>
      )}

      {searched && !loading && (
        <p className="mb-4 font-mono text-xs text-wm-text-secondary">
          {results.length} result{results.length !== 1 ? 's' : ''} for &quot;{query}&quot;
        </p>
      )}

      <div className="flex flex-col">
        {results.map((email) => (
          <div key={email.id} className="flex items-start gap-3 border-b border-wm-border p-4 transition-colors hover:bg-wm-surface-hover">
            {!email.isRead && <div className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-wm-accent" />}
            <Avatar name={extractSenderName(email.fromAddress)} size="md" />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className={cn('text-sm', !email.isRead ? 'font-semibold text-wm-text-primary' : 'text-wm-text-secondary')}>
                  {extractSenderName(email.fromAddress)}
                </span>
                <span className="font-mono text-[10px] text-wm-text-muted">
                  {formatRelativeTime(new Date(email.createdAt))}
                </span>
              </div>
              <p className={cn('text-sm', !email.isRead ? 'font-medium text-wm-text-primary' : 'text-wm-text-secondary')}>
                {email.subject || '(no subject)'}
              </p>
              <p className="mt-0.5 truncate font-mono text-[11px] text-wm-text-muted">
                {(email.textBody || '').slice(0, 150)}
              </p>
            </div>
          </div>
        ))}
      </div>

      {searched && !loading && results.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16">
          <p className="font-mono text-sm text-wm-text-muted">No results found.</p>
        </div>
      )}
    </div>
  )
}
