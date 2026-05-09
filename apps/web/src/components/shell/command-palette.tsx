'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Calendar as CalendarIcon,
  FileText,
  FolderKanban,
  Inbox as InboxIcon,
  KeyRound,
  LogOut,
  MessageSquare,
  PenLine,
  Plus,
  Search,
  Settings,
  Star,
  Users,
  Video,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Kbd } from '@/components/ui'

/**
 * Pencil reference: `Screen/CommandPalette` (`aAA4e`).
 * Cmd+K modal — a search field over a flat command list grouped by section.
 */

export interface CommandPaletteProps {
  open: boolean
  onClose: () => void
  /** Caller injects scoped commands (e.g. inbox actions when on /inbox). */
  contextualCommands?: Command[]
  onCompose?: () => void
  onLogout?: () => Promise<void> | void
  isAdmin?: boolean
}

export interface Command {
  id: string
  label: string
  hint?: string
  icon?: React.ReactNode
  shortcut?: string
  group?: string
  href?: string
  action?: () => void | Promise<void>
}

export function CommandPalette({
  open,
  onClose,
  contextualCommands = [],
  onCompose,
  onLogout,
  isAdmin,
}: CommandPaletteProps) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)

  const commands = useMemo<Command[]>(() => {
    const navigate: Command[] = [
      { id: 'go-inbox', label: 'Go to Inbox', group: 'Navigate', icon: <InboxIcon className="h-4 w-4" />, href: '/inbox', shortcut: 'G I' },
      { id: 'go-starred', label: 'Go to Starred', group: 'Navigate', icon: <Star className="h-4 w-4" />, href: '/inbox?folder=starred' },
      { id: 'go-chat', label: 'Go to Chat', group: 'Navigate', icon: <MessageSquare className="h-4 w-4" />, href: '/chat', shortcut: 'G C' },
      { id: 'go-calendar', label: 'Go to Calendar', group: 'Navigate', icon: <CalendarIcon className="h-4 w-4" />, href: '/calendar', shortcut: 'G K' },
      { id: 'go-work', label: 'Go to Work', group: 'Navigate', icon: <FolderKanban className="h-4 w-4" />, href: '/work', shortcut: 'G W' },
      { id: 'go-docs', label: 'Go to Docs', group: 'Navigate', icon: <FileText className="h-4 w-4" />, href: '/docs', shortcut: 'G D' },
      { id: 'go-meetings', label: 'Go to Meetings', group: 'Navigate', icon: <Video className="h-4 w-4" />, href: '/meetings' },
    ]
    const actions: Command[] = [
      { id: 'compose', label: 'Compose new email', group: 'Actions', icon: <Plus className="h-4 w-4" />, action: onCompose, shortcut: 'C' },
      { id: 'new-chat', label: 'New chat', group: 'Actions', icon: <MessageSquare className="h-4 w-4" />, href: '/chat/new' },
    ]
    const settings: Command[] = [
      { id: 'set-account', label: 'Account settings', group: 'Settings', icon: <Settings className="h-4 w-4" />, href: '/settings/account' },
      { id: 'set-signatures', label: 'Signatures', group: 'Settings', icon: <PenLine className="h-4 w-4" />, href: '/settings/signatures' },
      { id: 'set-api-keys', label: 'API keys', group: 'Settings', icon: <KeyRound className="h-4 w-4" />, href: '/settings/api-keys' },
    ]
    const admin: Command[] = isAdmin
      ? [
          { id: 'admin-users', label: 'Manage users', group: 'Admin', icon: <Users className="h-4 w-4" />, href: '/admin/users' },
          { id: 'admin-overview', label: 'Admin overview', group: 'Admin', icon: <Settings className="h-4 w-4" />, href: '/admin' },
        ]
      : []
    const account: Command[] = [
      { id: 'logout', label: 'Log out', group: 'Account', icon: <LogOut className="h-4 w-4" />, action: onLogout },
    ]
    return [...contextualCommands, ...navigate, ...actions, ...settings, ...admin, ...account]
  }, [contextualCommands, onCompose, onLogout, isAdmin])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return commands
    return commands.filter((c) => c.label.toLowerCase().includes(q) || c.hint?.toLowerCase().includes(q))
  }, [commands, query])

  // Focus / reset on open.
  useEffect(() => {
    if (open) {
      setQuery('')
      setActive(0)
      // Defer focus to next tick so the input is in the DOM.
      const t = setTimeout(() => inputRef.current?.focus(), 0)
      return () => clearTimeout(t)
    }
  }, [open])

  // Keyboard nav.
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActive((i) => Math.min(filtered.length - 1, i + 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActive((i) => Math.max(0, i - 1))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const cmd = filtered[active]
        if (cmd) runCommand(cmd)
      }
    }
    document.addEventListener('keydown', onKey)
    // body scroll lock
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
    // We intentionally re-bind on `active` and `filtered` so Enter picks the
    // currently visible item.
  }, [open, active, filtered, onClose])

  async function runCommand(cmd: Command) {
    if (cmd.action) {
      await cmd.action()
    } else if (cmd.href) {
      router.push(cmd.href)
    }
    onClose()
  }

  if (!open) return null

  // Group commands while preserving original order.
  const groups = filtered.reduce<Record<string, Command[]>>((acc, c) => {
    const key = c.group ?? ''
    acc[key] = acc[key] ?? []
    acc[key].push(c)
    return acc
  }, {})
  const groupOrder = Array.from(new Set(filtered.map((c) => c.group ?? '')))

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[15vh]"
    >
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden />
      <div className="relative w-full max-w-xl border border-wm-border bg-wm-surface shadow-2xl">
        <div className="flex items-center gap-3 border-b border-wm-border px-4 py-3">
          <Search className="h-4 w-4 text-wm-text-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
            }}
            placeholder="Search commands…"
            className="flex-1 bg-transparent font-mono text-sm text-wm-text-primary placeholder:text-wm-text-muted outline-none"
          />
          <Kbd>esc</Kbd>
        </div>
        <div className="max-h-[60vh] overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-4 py-10 text-center font-mono text-xs text-wm-text-muted">
              No commands match.
            </div>
          ) : (
            groupOrder.map((g) => (
              <div key={g}>
                {g && (
                  <div className="px-3 pb-1 pt-2 font-mono text-[10px] uppercase tracking-wider text-wm-text-muted">
                    {g}
                  </div>
                )}
                {groups[g].map((cmd) => {
                  const idx = filtered.indexOf(cmd)
                  const isActive = idx === active
                  return (
                    <button
                      key={cmd.id}
                      type="button"
                      onMouseEnter={() => setActive(idx)}
                      onClick={() => runCommand(cmd)}
                      className={cn(
                        'flex w-full cursor-pointer items-center gap-3 px-4 py-2 text-left font-mono text-xs transition-colors',
                        isActive
                          ? 'bg-wm-accent-dim text-wm-accent'
                          : 'text-wm-text-secondary hover:bg-wm-surface-hover hover:text-wm-text-primary',
                      )}
                    >
                      <span className="text-current">{cmd.icon}</span>
                      <span className="flex-1 truncate">{cmd.label}</span>
                      {cmd.shortcut && <Kbd>{cmd.shortcut}</Kbd>}
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>
        <div className="flex items-center justify-between border-t border-wm-border px-4 py-2 font-mono text-[10px] text-wm-text-muted">
          <div className="flex items-center gap-2">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd>
            <span>navigate</span>
          </div>
          <div className="flex items-center gap-2">
            <Kbd>↵</Kbd>
            <span>run</span>
          </div>
        </div>
      </div>
    </div>
  )
}
