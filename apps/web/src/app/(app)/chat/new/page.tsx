'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Check,
  Loader2,
  MessageSquare,
  Mic,
  Paperclip,
  Send,
  Smile,
  SquarePen,
  Users,
  X,
} from 'lucide-react'
import {
  useContactSearch,
  useConversations,
  useCreateDirectConversation,
  useCreateGroupConversation,
  type ContactSearchResult,
} from '@/lib/chat-queries'
import { WistMailError } from '@wistmail/shared'
import { cn, getInitials, stringToColor } from '@/lib/utils'

/// New-chat creation screen — Pencil `Screen/NewChatV3` (`yzyel`).
///
/// Layout splits the right side of the AppShell into:
///   - Conversation column (650 wide) — Pencil `p3k6ye`
///       header pill "✎ NEW CHAT", recipient field, match list,
///       recent contacts, bottom composer placeholder.
///   - Info panel (fill_container)              — Pencil `Dvw1o`
///       centered empty state + keyboard shortcut card.
///
/// Two creation modes share the screen:
///   - direct  → tap a result row, navigate to /chat/<id>
///   - group   → multi-select rows + group name, then "Create group"
///
/// `?kind=group` initialises the group flow when the segmented "+ NEW"
/// menu opens this screen for "New group".
export default function NewChatPage() {
  const router = useRouter()
  const params = useSearchParams()

  const [mode, setMode] = useState<'direct' | 'group'>(
    params.get('kind') === 'group' ? 'group' : 'direct',
  )
  const [query, setQuery] = useState('')
  const [title, setTitle] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Map<string, ContactSearchResult>>(
    () => new Map(),
  )
  const inputRef = useRef<HTMLInputElement | null>(null)

  const search = useContactSearch(query)
  const conversations = useConversations()
  const createDirect = useCreateDirectConversation()
  const createGroup = useCreateGroupConversation()

  const selectedList = useMemo(() => Array.from(selected.values()), [selected])
  const isCreating = createDirect.isPending || createGroup.isPending

  /// Derive a "RECENT CONTACTS" list from the cached conversations
  /// query.  We dedupe by user id and surface the four most recently
  /// active counterparts, exactly the way Pencil's static
  /// `recentContacts` block frames them.
  const recentContacts = useMemo<
    Array<ContactSearchResult & { lastMessageAt: string }>
  >(() => {
    if (!conversations.data) return []
    const out: Map<string, ContactSearchResult & { lastMessageAt: string }> =
      new Map()
    for (const c of conversations.data) {
      if (c.kind !== 'direct') continue
      const p = c.otherParticipants[0]
      if (!p) continue
      if (out.has(p.id)) continue
      out.set(p.id, { ...p, lastMessageAt: c.lastMessageAt })
      if (out.size >= 4) break
    }
    return Array.from(out.values())
  }, [conversations.data])

  function toggleSelect(u: ContactSearchResult) {
    setSelected((prev) => {
      const next = new Map(prev)
      if (next.has(u.id)) next.delete(u.id)
      else next.set(u.id, u)
      return next
    })
  }

  async function startDirectWith(emailOrUser: string | ContactSearchResult) {
    setError(null)
    const email =
      typeof emailOrUser === 'string' ? emailOrUser : emailOrUser.email
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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = query.trim()
    if (mode === 'direct' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      void startDirectWith(trimmed)
    }
  }

  // Pencil shortcuts — ⌘G toggles to group flow, Esc cancels back to
  // the inbox chats view, Enter on a focused row creates the chat.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null
      const typing =
        t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' ||
          t.isContentEditable)
      if (e.key === 'Escape') {
        e.preventDefault()
        router.push('/inbox?kind=chats')
        return
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'g' || e.key === 'G')) {
        e.preventDefault()
        setMode((m) => (m === 'group' ? 'direct' : 'group'))
      }
      if (typing) return
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [router])

  const matches = search.data ?? []
  const matchCount = query.trim().length === 0 ? 0 : matches.length

  return (
    <div className="flex h-full">
      {/* ── Conversation column — Pencil p3k6ye ──
          width 650, fill #000, 1px right hairline #1A1A1A. */}
      <div
        className="flex w-[650px] shrink-0 flex-col"
        style={{
          background: 'var(--color-wm-bg)',
          borderRight: '1px solid var(--color-wm-border)',
        }}
      >
        {/* Header pill — Pencil "NEW CHAT" badge.
            Lime-outlined chip, 24px tall, rounded, with edit icon. */}
        <div
          className="flex items-center"
          style={{ padding: '20px 24px 0 24px', gap: 12 }}
        >
          <span
            className="inline-flex items-center font-mono font-bold uppercase"
            style={{
              gap: 6,
              padding: '4px 10px',
              borderRadius: 12,
              border: '1px solid var(--color-wm-accent)',
              color: 'var(--color-wm-accent)',
              fontSize: 10,
              letterSpacing: 1.5,
            }}
          >
            <SquarePen style={{ width: 11, height: 11 }} />
            {mode === 'group' ? 'New group' : 'New chat'}
          </span>
          <span style={{ flex: 1 }} />
          <button
            type="button"
            onClick={() => setMode((m) => (m === 'group' ? 'direct' : 'group'))}
            className="inline-flex cursor-pointer items-center font-mono font-semibold uppercase text-wm-text-secondary hover:text-wm-text-primary"
            style={{ gap: 6, fontSize: 10, letterSpacing: 1 }}
            aria-label="Switch creation mode"
          >
            {mode === 'group' ? (
              <>
                <MessageSquare style={{ width: 11, height: 11 }} />
                Direct
              </>
            ) : (
              <>
                <Users style={{ width: 11, height: 11 }} />
                Group
              </>
            )}
            <kbd
              className="font-mono font-semibold"
              style={{
                padding: '2px 5px',
                borderRadius: 4,
                fontSize: 9,
                background: '#000',
                color: '#6e6e6e',
                border: '1px solid var(--color-wm-border)',
              }}
            >
              ⌘G
            </kbd>
          </button>
        </div>

        {/* Group title field (group mode only). */}
        {mode === 'group' && (
          <div style={{ padding: '16px 24px 0 24px' }}>
            <label
              htmlFor="group-title"
              className="mb-1 block font-mono font-bold uppercase text-wm-text-muted"
              style={{ fontSize: 10, letterSpacing: 1.5 }}
            >
              Name
            </label>
            <input
              id="group-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Engineering"
              className="w-full bg-transparent font-mono text-wm-text-primary placeholder:text-wm-text-muted outline-none focus:border-wm-accent"
              style={{
                fontSize: 13,
                padding: '8px 14px',
                borderRadius: 22,
                border: '1px solid var(--color-wm-border)',
                background: 'var(--color-wm-surface)',
              }}
            />
          </div>
        )}

        {/* Recipient input — "TO" label + rounded lime-bordered field. */}
        <form
          onSubmit={handleSubmit}
          className="flex items-center"
          style={{ padding: '16px 24px 0 24px', gap: 14 }}
        >
          <span
            className="font-mono font-bold uppercase text-wm-text-muted"
            style={{ fontSize: 10, letterSpacing: 1.5 }}
          >
            To
          </span>
          <div
            className="flex flex-1 items-center bg-transparent"
            style={{
              padding: '8px 16px',
              borderRadius: 22,
              border: '1px solid var(--color-wm-accent)',
              gap: 10,
            }}
          >
            <input
              ref={inputRef}
              autoFocus
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                mode === 'direct'
                  ? 'Search by name or email…'
                  : 'Search teammates to add…'
              }
              className="flex-1 bg-transparent font-mono text-wm-text-primary placeholder:text-wm-text-muted outline-none"
              style={{ fontSize: 13 }}
            />
            {isCreating && (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-wm-accent" />
            )}
          </div>
        </form>

        {/* Selected chips (group mode). */}
        {mode === 'group' && selectedList.length > 0 && (
          <div
            className="flex flex-wrap"
            style={{ padding: '10px 24px 0 24px', gap: 6 }}
          >
            {selectedList.map((u) => (
              <span
                key={u.id}
                className="inline-flex items-center bg-wm-accent/10 font-mono text-wm-text-primary"
                style={{
                  gap: 6,
                  padding: '4px 8px',
                  borderRadius: 12,
                  border: '1px solid var(--color-wm-accent)',
                  fontSize: 11,
                }}
              >
                {u.name}
                <button
                  type="button"
                  onClick={() => toggleSelect(u)}
                  className="cursor-pointer text-wm-text-muted hover:text-wm-error"
                  aria-label={`Remove ${u.name}`}
                >
                  <X style={{ width: 11, height: 11 }} />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Match list */}
        <div className="flex-1 overflow-y-auto" style={{ padding: '20px 0' }}>
          {query.trim().length > 0 && (
            <SectionHeader
              label={`Matches · ${matchCount}`}
              loading={search.isPending}
            />
          )}

          {query.trim().length > 0 &&
            !search.isPending &&
            matches.length === 0 && (
              <p
                className="font-mono"
                style={{
                  padding: '12px 24px',
                  fontSize: 11,
                  color: '#6e6e6e',
                }}
              >
                No matches in your organization.
                {/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(query.trim()) &&
                  mode === 'direct' && (
                    <>
                      {' '}
                      Press Enter to invite{' '}
                      <span className="text-wm-accent">{query.trim()}</span>.
                    </>
                  )}
              </p>
            )}

          {matches.map((u, i) => {
            const isSelected = selected.has(u.id)
            const external = !u.email.endsWith('@wistmail.app')
            return (
              <ContactRow
                key={u.id}
                user={u}
                primary={mode === 'direct' && i === 0}
                selected={isSelected}
                external={external}
                showCheck={mode === 'group'}
                onClick={() => {
                  if (mode === 'direct') void startDirectWith(u)
                  else toggleSelect(u)
                }}
              />
            )
          })}

          {recentContacts.length > 0 && (
            <>
              <SectionHeader
                label="Recent contacts"
                style={{ marginTop: matches.length > 0 ? 16 : 0 }}
              />
              {recentContacts.map((u) => (
                <RecentContactRow
                  key={u.id}
                  user={u}
                  onClick={() => {
                    if (mode === 'direct') void startDirectWith(u)
                    else toggleSelect(u)
                  }}
                />
              ))}
            </>
          )}

          {error && (
            <p
              className="font-mono"
              style={{
                padding: '8px 24px 0 24px',
                fontSize: 11,
                color: 'var(--color-wm-error)',
              }}
            >
              {error}
            </p>
          )}
        </div>

        {/* Bottom composer — Pencil placeholder bar. Disabled until a
            recipient is committed; selecting one opens /chat/<id>
            where the real composer lives, so this row is purely a
            visual anchor in the V3 layout. */}
        {mode === 'group' && selectedList.length > 0 ? (
          <div
            style={{
              padding: '12px 24px',
              borderTop: '1px solid var(--color-wm-border)',
            }}
          >
            <button
              type="button"
              onClick={() => void createGroupChat()}
              disabled={
                isCreating ||
                title.trim().length === 0 ||
                selectedList.length === 0
              }
              className="inline-flex w-full cursor-pointer items-center justify-center bg-wm-accent font-mono font-bold uppercase text-black transition-colors hover:bg-wm-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
              style={{
                gap: 8,
                padding: '10px 16px',
                borderRadius: 22,
                fontSize: 12,
                letterSpacing: 1,
              }}
            >
              {createGroup.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Users style={{ width: 14, height: 14 }} />
              )}
              {createGroup.isPending
                ? 'Creating…'
                : `Create group (${selectedList.length})`}
            </button>
          </div>
        ) : (
          <div
            className="flex items-center"
            style={{
              padding: '12px 16px',
              borderTop: '1px solid var(--color-wm-border)',
              gap: 10,
            }}
          >
            <Paperclip
              style={{ width: 16, height: 16, color: '#6e6e6e' }}
              aria-hidden
            />
            <input
              type="text"
              disabled
              placeholder="Pick a recipient first…"
              className="flex-1 bg-transparent font-mono text-wm-text-primary placeholder:text-wm-text-muted outline-none"
              style={{ fontSize: 13 }}
            />
            <Smile
              style={{ width: 16, height: 16, color: '#6e6e6e' }}
              aria-hidden
            />
            <Mic
              style={{ width: 16, height: 16, color: '#6e6e6e' }}
              aria-hidden
            />
            <span
              className="flex items-center justify-center"
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                background: 'var(--color-wm-accent)',
                opacity: 0.5,
              }}
            >
              <Send
                style={{ width: 14, height: 14, color: '#000' }}
                aria-hidden
              />
            </span>
          </div>
        )}
      </div>

      {/* ── Info panel — Pencil Dvw1o ── */}
      <NewChatInfoPanel
        mode={mode}
        onCancel={() => router.push('/inbox?kind=chats')}
      />
    </div>
  )
}

function SectionHeader({
  label,
  loading,
  style,
}: {
  label: string
  loading?: boolean
  style?: React.CSSProperties
}) {
  return (
    <div
      className="flex items-center"
      style={{ padding: '0 24px 8px 24px', gap: 8, ...style }}
    >
      <span
        className="font-mono font-bold uppercase text-wm-text-muted"
        style={{ fontSize: 10, letterSpacing: 1.5 }}
      >
        {label}
      </span>
      {loading && (
        <Loader2 className="h-3 w-3 animate-spin text-wm-text-muted" />
      )}
    </div>
  )
}

/// Full-width user row — Pencil ContactPicker rows in `Screen/NewChatV3`.
///
///   avatar (40)             ← deterministic colour, initials, lime
///                             presence dot bottom-right when active
///   name (13/600 white)
///     · ACTIVE (lime 9/700)  ← only on the currently highlighted match
///   role / handle (11/normal #6e6e6e)
///                             ← derived from email handle since the
///                               `ContactSearchResult` shape doesn't
///                               carry an explicit role today
///   trailing
///     EXTERNAL chip          ← amber, when email is outside the org
///     check (group mode)     ← lime when selected, hairline when not
function ContactRow({
  user,
  primary,
  selected,
  external,
  showCheck,
  onClick,
}: {
  user: ContactSearchResult
  primary?: boolean
  selected?: boolean
  external?: boolean
  showCheck?: boolean
  onClick: () => void
}) {
  const initials = getInitials(user.name)
  const bg = stringToColor(user.name)
  const handle = user.email.split('@')[0]
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group/row flex w-full cursor-pointer items-center text-left transition-colors hover:bg-wm-surface-hover',
        primary && !selected && 'bg-wm-accent/5',
        selected && 'bg-wm-accent/10',
      )}
      style={{ gap: 14, padding: '10px 24px' }}
    >
      <span
        aria-hidden
        className="relative flex shrink-0 items-center justify-center rounded-full font-mono font-bold text-white"
        style={{ width: 40, height: 40, fontSize: 14, backgroundColor: bg }}
      >
        {initials || '?'}
        {primary && (
          <span
            aria-hidden
            className="absolute"
            style={{
              right: -1,
              bottom: -1,
              width: 12,
              height: 12,
              borderRadius: 999,
              background: 'var(--color-wm-accent)',
              boxShadow: '0 0 0 2px #000000',
            }}
          />
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col" style={{ gap: 2 }}>
        <span className="flex items-center" style={{ gap: 8 }}>
          <span
            className="truncate font-mono font-semibold text-wm-text-primary"
            style={{ fontSize: 13 }}
          >
            {user.name}
          </span>
          {primary && !showCheck && (
            <span
              className="font-mono font-bold uppercase"
              style={{
                fontSize: 9,
                letterSpacing: 1,
                color: 'var(--color-wm-accent)',
              }}
            >
              Active
            </span>
          )}
        </span>
        <span
          className="truncate font-mono"
          style={{ fontSize: 11, color: '#6e6e6e' }}
        >
          @{handle} · {user.email}
        </span>
      </span>
      {external && !showCheck && (
        <span
          className="shrink-0 font-mono font-bold uppercase"
          style={{
            padding: '3px 8px',
            borderRadius: 4,
            fontSize: 9,
            letterSpacing: 1,
            color: '#FFB347',
            background: 'rgba(255,179,71,0.1)',
            border: '1px solid rgba(255,179,71,0.3)',
          }}
        >
          External
        </span>
      )}
      {showCheck && (
        <span
          aria-hidden
          className="flex shrink-0 items-center justify-center"
          style={{
            width: 22,
            height: 22,
            borderRadius: 11,
            border: selected
              ? '1px solid var(--color-wm-accent)'
              : '1px solid var(--color-wm-border)',
            background: selected ? 'var(--color-wm-accent)' : 'transparent',
            color: '#000',
          }}
        >
          {selected && <Check style={{ width: 12, height: 12 }} />}
        </span>
      )}
    </button>
  )
}

function RecentContactRow({
  user,
  onClick,
}: {
  user: ContactSearchResult & { lastMessageAt: string }
  onClick: () => void
}) {
  const initials = getInitials(user.name)
  const bg = stringToColor(user.name)
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full cursor-pointer items-center text-left transition-colors hover:bg-wm-surface-hover"
      style={{ gap: 12, padding: '8px 24px' }}
    >
      <span
        aria-hidden
        className="flex shrink-0 items-center justify-center rounded-full font-mono font-bold text-white"
        style={{ width: 28, height: 28, fontSize: 11, backgroundColor: bg }}
      >
        {initials || '?'}
      </span>
      <span
        className="truncate font-mono font-semibold text-wm-text-primary"
        style={{ fontSize: 12 }}
      >
        {user.name}
      </span>
      <span
        className="truncate font-mono"
        style={{ fontSize: 10, color: '#6e6e6e' }}
      >
        Last chat {formatRelativeChat(user.lastMessageAt)}
      </span>
    </button>
  )
}

function NewChatInfoPanel({
  mode,
  onCancel,
}: {
  mode: 'direct' | 'group'
  onCancel: () => void
}) {
  return (
    <aside
      className="flex flex-1 flex-col items-center justify-center"
      style={{
        background: 'var(--color-wm-bg)',
        padding: '0 32px',
        gap: 18,
      }}
    >
      <span
        aria-hidden
        className="flex items-center justify-center"
        style={{
          width: 56,
          height: 56,
          borderRadius: 14,
          border: '1px solid var(--color-wm-accent)',
          background: 'rgba(191,255,0,0.08)',
        }}
      >
        <SquarePen
          style={{ width: 22, height: 22, color: 'var(--color-wm-accent)' }}
        />
      </span>
      <div className="flex flex-col items-center" style={{ gap: 8 }}>
        <h2
          className="font-mono font-bold text-wm-text-primary"
          style={{ fontSize: 16 }}
        >
          {mode === 'group' ? 'Start a new group' : 'Start a new chat'}
        </h2>
        <p
          className="text-center font-mono"
          style={{
            fontSize: 11,
            lineHeight: 1.6,
            color: '#6e6e6e',
            maxWidth: 240,
          }}
        >
          Pick someone from your team or invite an external collaborator.
          Conversations are end-to-end encrypted.
        </p>
      </div>

      <div
        className="flex w-full flex-col"
        style={{
          maxWidth: 240,
          padding: 12,
          borderRadius: 12,
          border: '1px solid var(--color-wm-border)',
          background: 'var(--color-wm-surface)',
          gap: 8,
        }}
      >
        <p
          className="font-mono font-bold uppercase"
          style={{
            fontSize: 9,
            letterSpacing: 1.5,
            color: '#6e6e6e',
            marginBottom: 4,
          }}
        >
          Shortcuts
        </p>
        <ShortcutRow label="Pick selected" kbd="↵" />
        <ShortcutRow
          label={mode === 'group' ? 'Switch to direct' : 'Switch to group'}
          kbd="⌘G"
        />
        <ShortcutRow label="Cancel" kbd="ESC" onClick={onCancel} />
      </div>
    </aside>
  )
}

function ShortcutRow({
  label,
  kbd,
  onClick,
}: {
  label: string
  kbd: string
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        'flex w-full items-center justify-between font-mono',
        onClick && 'cursor-pointer hover:text-wm-text-primary',
      )}
      style={{ fontSize: 11, color: '#999999' }}
    >
      <span>{label}</span>
      <kbd
        className="font-mono font-semibold"
        style={{
          padding: '2px 6px',
          borderRadius: 4,
          fontSize: 9,
          background: '#000',
          color: '#6e6e6e',
          border: '1px solid var(--color-wm-border)',
        }}
      >
        {kbd}
      </kbd>
    </button>
  )
}

function formatRelativeChat(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.floor(ms / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const days = Math.floor(hr / 24)
  if (days < 7) return `${days}d ago`
  return `${Math.floor(days / 7)}w ago`
}

function formatError(err: unknown): string {
  if (err instanceof WistMailError) return err.message
  return 'Something went wrong — please try again.'
}
