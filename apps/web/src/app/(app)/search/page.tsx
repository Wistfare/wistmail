'use client'

import { useState } from 'react'
import { Calendar, Paperclip, Search as SearchIcon, X } from 'lucide-react'
import { api } from '@/lib/api-client'
import { PageHeader } from '@/components/shell'
import { EmailRowV3 } from '@/components/email/email-row-v3'
import { EmptyState, FieldStack } from '@/components/ui'
import { cn } from '@/lib/utils'

type Email = {
  id: string
  fromAddress: string
  subject: string
  textBody: string | null
  isRead: boolean
  isStarred: boolean
  createdAt: string
}

/**
 * `/search` — Pencil reference: `Screen/Search` (`ujv7W`).
 * Single-column results page reusing `EmailRowV3` so rows match the
 * inbox visual exactly.
 */
export default function SearchPage() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Email[]>([])
  const [searched, setSearched] = useState(false)
  const [loading, setLoading] = useState(false)
  const [filterHasAttachment, setFilterHasAttachment] = useState(false)
  const [filterUnread, setFilterUnread] = useState(false)

  async function handleSearch(e?: React.FormEvent) {
    e?.preventDefault()
    if (!query.trim()) return
    setLoading(true)
    setSearched(true)
    try {
      const res = await api.get<{ data: Email[] }>(
        `/api/v1/inbox/search?q=${encodeURIComponent(query)}`,
      )
      setResults(res.data)
    } catch {
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  function reset() {
    setQuery('')
    setResults([])
    setSearched(false)
  }

  function extract(addr: string) {
    if (addr.includes('<')) return addr.split('<')[0].trim().replace(/"/g, '')
    return addr.split('@')[0]
  }

  const filtered = results.filter((r) => {
    if (filterUnread && r.isRead) return false
    return true
  })

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        eyebrow="Search"
        title="Search mail"
        subtitle={searched ? `${filtered.length} result${filtered.length === 1 ? '' : 's'}` : undefined}
      />

      <div className="flex flex-col gap-4 px-6 py-5">
        <form onSubmit={handleSearch}>
          <FieldStack label="Query">
            <div className="flex h-12 items-center gap-3 border border-wm-accent bg-wm-surface px-4 transition-colors focus-within:ring-1 focus-within:ring-wm-accent/40">
              <SearchIcon className="h-4 w-4 text-wm-accent" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by subject, sender, or content…"
                className="flex-1 bg-transparent font-mono text-[13px] text-wm-text-primary placeholder:text-wm-text-muted outline-none"
                autoFocus
              />
              {query && (
                <button
                  type="button"
                  onClick={reset}
                  className="cursor-pointer text-wm-text-muted hover:text-wm-text-secondary"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </FieldStack>
        </form>

        <div className="flex flex-wrap items-center gap-2">
          <FilterChip
            icon={<Calendar className="h-3 w-3" />}
            active={false}
            onClick={() => undefined}
          >
            Any time
          </FilterChip>
          <FilterChip
            icon={<Paperclip className="h-3 w-3" />}
            active={filterHasAttachment}
            onClick={() => setFilterHasAttachment((v) => !v)}
          >
            Has attachment
          </FilterChip>
          <FilterChip active={filterUnread} onClick={() => setFilterUnread((v) => !v)}>
            Unread only
          </FilterChip>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-16">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-wm-accent border-t-transparent" />
          </div>
        )}
        {!loading && searched && filtered.length === 0 && (
          <EmptyState
            title="No results"
            description={`Nothing matches “${query}”. Try a different keyword or remove a filter.`}
          />
        )}
        {!loading && filtered.length > 0 && (
          <div className="flex flex-col">
            {filtered.map((r) => (
              <EmailRowV3
                key={r.id}
                email={{
                  id: r.id,
                  fromAddress: r.fromAddress,
                  displayName: extract(r.fromAddress),
                  subject: r.subject,
                  snippet: (r.textBody ?? '').slice(0, 160),
                  timeLabel: formatRowTime(r.createdAt),
                  isRead: r.isRead,
                  isStarred: r.isStarred,
                  tag: 'MAIL',
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Pencil-style row timestamp:
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

function FilterChip({
  icon,
  active,
  children,
  onClick,
}: {
  icon?: React.ReactNode
  active: boolean
  children: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 font-mono text-[11px] font-semibold transition-colors',
        active
          ? 'border-wm-accent bg-wm-accent-dim text-wm-accent'
          : 'border-wm-border bg-wm-surface text-wm-text-secondary hover:bg-wm-surface-hover',
      )}
    >
      {icon}
      {children}
    </button>
  )
}
