'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Check, Loader2, Search, UserPlus, Users, X } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import {
  useContactSearch,
  useCreateDirectConversation,
  useCreateGroupConversation,
  type ContactSearchResult,
} from '@/lib/chat-queries'
import { WistMailError } from '@wistmail/shared'
import { cn } from '@/lib/utils'

/// New-chat picker. Two modes:
///   1. **Direct** — search → tap a row to start a 1:1.
///   2. **Group** — multi-select rows + a title field, then "Create group".
/// The mode toggle sits at the top; everything below adapts to it.
export default function NewChatPage() {
  const router = useRouter()
  const [mode, setMode] = useState<'direct' | 'group'>('direct')
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [selected, setSelected] = useState<Map<string, ContactSearchResult>>(
    () => new Map(),
  )

  const search = useContactSearch(query)
  const createDirect = useCreateDirectConversation()
  const createGroup = useCreateGroupConversation()

  const selectedList = useMemo(() => Array.from(selected.values()), [selected])

  function toggleSelect(u: ContactSearchResult) {
    setSelected((prev) => {
      const next = new Map(prev)
      if (next.has(u.id)) next.delete(u.id)
      else next.set(u.id, u)
      return next
    })
  }

  async function startDirectWith(email: string) {
    setError(null)
    try {
      const id = await createDirect.mutateAsync(email)
      router.push(`/chat/${id}`)
    } catch (err) {
      setError(formatError(err))
    }
  }

  async function createGroupChat() {
    setError(null)
    if (title.trim().length === 0) {
      setError('Give the group a name.')
      return
    }
    if (selectedList.length === 0) {
      setError('Pick at least one teammate to add.')
      return
    }
    try {
      const id = await createGroup.mutateAsync({
        title: title.trim(),
        participantIds: selectedList.map((u) => u.id),
      })
      router.push(`/chat/${id}`)
    } catch (err) {
      setError(formatError(err))
    }
  }

  function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (mode !== 'direct') return
    const trimmed = query.trim()
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      void startDirectWith(trimmed)
    }
  }

  const isCreating = createDirect.isPending || createGroup.isPending

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-wm-border px-6 py-3">
        <button
          type="button"
          onClick={() => router.push('/chat')}
          className="cursor-pointer text-wm-text-muted hover:text-wm-text-primary"
          aria-label="Back to chats"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className="text-sm font-semibold text-wm-text-primary">New chat</h1>
      </div>

      {/* Mode toggle */}
      <div className="flex items-center gap-2 border-b border-wm-border px-6 py-2">
        <ModeBtn
          active={mode === 'direct'}
          onClick={() => {
            setMode('direct')
            setError(null)
          }}
          icon={<UserPlus className="h-3.5 w-3.5" />}
          label="Direct"
        />
        <ModeBtn
          active={mode === 'group'}
          onClick={() => {
            setMode('group')
            setError(null)
          }}
          icon={<Users className="h-3.5 w-3.5" />}
          label="Group"
        />
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {mode === 'group' && (
          <div className="mb-4">
            <label
              htmlFor="group-title"
              className="mb-1 block font-mono text-[10px] font-semibold uppercase tracking-[1.5px] text-wm-text-muted"
            >
              Group name
            </label>
            <input
              id="group-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Engineering"
              className="w-full border border-wm-border bg-wm-surface px-3 py-2 font-mono text-[13px] text-wm-text-primary placeholder:text-wm-text-muted outline-none focus:border-wm-accent"
            />
          </div>
        )}

        {mode === 'group' && selectedList.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2">
            {selectedList.map((u) => (
              <span
                key={u.id}
                className="inline-flex items-center gap-1 border border-wm-accent/40 bg-wm-accent/10 px-2 py-1 font-mono text-[11px] text-wm-text-primary"
              >
                {u.name}
                <button
                  type="button"
                  onClick={() => toggleSelect(u)}
                  className="cursor-pointer text-wm-text-muted hover:text-wm-error"
                  aria-label={`Remove ${u.name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        <form
          onSubmit={handleEmailSubmit}
          className="flex items-center gap-2 border border-wm-border bg-wm-surface px-3 py-2"
        >
          <Search className="h-4 w-4 text-wm-text-muted" />
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              mode === 'direct'
                ? 'Search by name or email…'
                : 'Search for teammates to add…'
            }
            className="flex-1 bg-transparent font-mono text-[13px] text-wm-text-primary placeholder:text-wm-text-muted outline-none"
          />
          {isCreating && (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-wm-accent" />
          )}
        </form>

        {error && (
          <p className="mt-3 font-mono text-[11px] text-wm-error">{error}</p>
        )}

        <div className="mt-4 flex flex-col">
          {query.trim().length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              {mode === 'direct' ? (
                <>
                  <UserPlus className="h-8 w-8 text-wm-text-muted" />
                  <p className="text-sm text-wm-text-primary">
                    Start typing to find a teammate
                  </p>
                  <p className="font-mono text-[11px] text-wm-text-muted">
                    Or paste a full email and press Enter.
                  </p>
                </>
              ) : (
                <>
                  <Users className="h-8 w-8 text-wm-text-muted" />
                  <p className="text-sm text-wm-text-primary">
                    Search and select teammates to invite
                  </p>
                </>
              )}
            </div>
          ) : search.isPending ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-4 w-4 animate-spin text-wm-accent" />
            </div>
          ) : (search.data ?? []).length === 0 ? (
            <p className="py-6 text-center font-mono text-[11px] text-wm-text-muted">
              No matches in your organization.
            </p>
          ) : (
            (search.data ?? []).map((u) => {
              const isSelected = selected.has(u.id)
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => {
                    if (mode === 'direct') {
                      void startDirectWith(u.email)
                    } else {
                      toggleSelect(u)
                    }
                  }}
                  disabled={isCreating}
                  className={cn(
                    'flex w-full cursor-pointer items-center gap-3 border-b border-wm-border px-2 py-3 text-left transition-colors hover:bg-wm-surface-hover disabled:opacity-60',
                    isSelected && 'bg-wm-accent/5',
                  )}
                >
                  <Avatar name={u.name} src={u.avatarUrl} size="md" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-wm-text-primary">
                      {u.name}
                    </p>
                    <p className="truncate font-mono text-[10px] text-wm-text-muted">
                      {u.email}
                    </p>
                  </div>
                  {mode === 'group' && (
                    <span
                      className={cn(
                        'flex h-5 w-5 items-center justify-center border',
                        isSelected
                          ? 'border-wm-accent bg-wm-accent text-wm-text-on-accent'
                          : 'border-wm-border bg-wm-surface text-transparent',
                      )}
                    >
                      <Check className="h-3 w-3" />
                    </span>
                  )}
                </button>
              )
            })
          )}
        </div>
      </div>

      {mode === 'group' && (
        <div className="border-t border-wm-border px-6 py-3">
          <button
            type="button"
            onClick={() => void createGroupChat()}
            disabled={
              isCreating ||
              title.trim().length === 0 ||
              selectedList.length === 0
            }
            className="inline-flex w-full cursor-pointer items-center justify-center gap-2 bg-wm-accent px-4 py-2.5 font-mono text-[13px] font-semibold text-wm-text-on-accent transition-colors hover:bg-wm-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {createGroup.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Users className="h-4 w-4" />
            )}
            {createGroup.isPending
              ? 'Creating…'
              : `Create group${selectedList.length > 0 ? ` (${selectedList.length})` : ''}`}
          </button>
        </div>
      )}
    </div>
  )
}

function ModeBtn({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex cursor-pointer items-center gap-1 border px-3 py-1.5 font-mono text-[11px] font-semibold transition-colors',
        active
          ? 'border-wm-accent bg-wm-accent/10 text-wm-accent'
          : 'border-wm-border text-wm-text-secondary hover:bg-wm-surface-hover',
      )}
    >
      {icon}
      {label}
    </button>
  )
}

function formatError(err: unknown): string {
  if (err instanceof WistMailError) return err.message
  return 'Something went wrong — please try again.'
}
