'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, Mail, MessageSquare, Plus, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCompose } from '@/components/email/compose-provider'

export type NewDropdownContext = 'all' | 'mail' | 'chats'

export interface NewDropdownProps {
  /// Filter context.  Mirrors the inbox segmented control:
  ///   'all'   → full menu (Email + Chat + Group)            — Pencil cZcJ2
  ///   'mail'  → no menu; clicking the pill opens compose directly
  ///   'chats' → menu trimmed to (Chat + Group)              — Pencil lglRd
  context?: NewDropdownContext
}

/**
 * "+ NEW ▾" pill + dropdown menu — Pencil reference:
 * `Screen/InboxV3.composePill` (`vsugi`) + `newDropdown` (`cZcJ2`/`lglRd`).
 *
 * Pill (`vsugi`):
 *   cornerRadius 19, fill lime, padding [8, 14], gap 7
 *   drop-shadow blur 16 #BFFF0040 offset y=4
 *   plus 14 black + "NEW" 11/700 black tracking 1 + chevron-down 11 black
 *
 * Menu container:
 *   width 288, cornerRadius 14, fill #111111, 1px #1A1A1A border,
 *   padding 6, gap 2, drop-shadow blur 32 #00000080 offset y=12
 *
 *   ddHead — "CREATE NEW" 9/700 #6e6e6e tracking 1.5
 *
 *   Items (radius 10, padding 10, gap 12):
 *     ic   — 32×32 round-square fill #000 with centered 15-px lucide icon
 *     col  — title 13/600 white + subtitle 10/normal #6e6e6e
 *     kbd  — radius 5 #000 1px #1A1A1A border 10/600 #6e6e6e
 *
 *   Pencil ships two variants of the menu:
 *     `cZcJ2` (NewAll)  — Email + Chat + Group  → context='all'
 *     `lglRd` (NewChat) — Chat + Group          → context='chats'
 *   `context='mail'` doesn't open a menu — Pencil shows the pill
 *   directly opening the compose modal because there's only one
 *   thing the user could create on a mail-filtered inbox.
 */
export function NewDropdown({ context = 'all' }: NewDropdownProps) {
  const router = useRouter()
  const { openCompose } = useCompose()
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const itemRefs = useRef<HTMLButtonElement[]>([])
  const [hovered, setHovered] = useState<number | null>(null)

  // Close on outside click + Esc.
  useEffect(() => {
    if (!open) return
    function onPointer(e: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Cmd/Ctrl shortcuts. ⌘N opens compose; ⌘D and ⌘G route to the
  // chat creation flow. We register them globally so the user doesn't
  // need the menu open to trigger them.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey)) return
      // Skip when typing in an input/textarea/contentEditable —
      // browsers reserve ⌘N etc. for the OS, but we still want to
      // avoid intercepting common editor shortcuts.
      const t = e.target as HTMLElement | null
      if (
        t &&
        (t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          t.isContentEditable)
      ) {
        return
      }
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault()
        openCompose()
        setOpen(false)
      } else if (e.key === 'd' || e.key === 'D') {
        e.preventDefault()
        router.push('/chat/new')
        setOpen(false)
      } else if (e.key === 'g' || e.key === 'G') {
        e.preventDefault()
        router.push('/chat/new?kind=group')
        setOpen(false)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [openCompose, router])

  // Pencil ships the dropdown items in this order; the chats-only
  // variant (`lglRd`) just drops the email entry.
  const allItems = [
    {
      key: 'email',
      icon: Mail,
      title: 'New email',
      subtitle: 'Compose a message',
      kbd: '⌘N',
      onSelect: () => {
        openCompose()
        setOpen(false)
      },
    },
    {
      key: 'chat',
      icon: MessageSquare,
      title: 'New chat',
      subtitle: 'Direct message someone',
      kbd: '⌘D',
      onSelect: () => {
        router.push('/chat/new')
        setOpen(false)
      },
    },
    {
      key: 'group',
      icon: Users,
      title: 'New group',
      subtitle: 'Start a group conversation',
      kbd: '⌘G',
      onSelect: () => {
        router.push('/chat/new?kind=group')
        setOpen(false)
      },
    },
  ] as const

  const items =
    context === 'chats'
      ? allItems.filter((it) => it.key !== 'email')
      : allItems

  function onTriggerKey(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      // Defer focus until the menu mounts.
      requestAnimationFrame(() => itemRefs.current[0]?.focus())
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      setOpen((v) => !v)
    }
  }

  function onItemKey(e: React.KeyboardEvent<HTMLButtonElement>, idx: number) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const next = (idx + 1) % items.length
      itemRefs.current[next]?.focus()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const prev = (idx - 1 + items.length) % items.length
      itemRefs.current[prev]?.focus()
    } else if (e.key === 'Home') {
      e.preventDefault()
      itemRefs.current[0]?.focus()
    } else if (e.key === 'End') {
      e.preventDefault()
      itemRefs.current[items.length - 1]?.focus()
    } else if (e.key === 'Tab') {
      // Closing on Tab matches typical menu behaviour.
      setOpen(false)
    }
  }

  // On the MAIL filter the pill is a single-action button — no
  // dropdown, no chevron — because compose is the only thing the
  // user could create from a mail-only view.
  const isMailOnly = context === 'mail'

  function handleTriggerClick() {
    if (isMailOnly) {
      openCompose()
      return
    }
    setOpen((v) => !v)
  }

  return (
    <div ref={wrapperRef} className="relative">
      {/* Pill trigger — Pencil `vsugi`. */}
      <button
        ref={buttonRef}
        type="button"
        onClick={handleTriggerClick}
        onKeyDown={isMailOnly ? undefined : onTriggerKey}
        aria-haspopup={isMailOnly ? undefined : 'menu'}
        aria-expanded={isMailOnly ? undefined : open}
        aria-label={isMailOnly ? 'New email' : 'New message or chat'}
        className="inline-flex cursor-pointer items-center bg-wm-accent transition-colors hover:bg-wm-accent-hover"
        style={{
          gap: 7,
          padding: '8px 14px',
          borderRadius: 19,
          // Pencil shadow recipe: blur 16, color #BFFF0040 (≈0.25 alpha),
          // offset y=4.
          boxShadow: '0 4px 16px 0 rgba(191,255,0,0.25)',
          color: '#000000',
        }}
      >
        <Plus style={{ width: 14, height: 14 }} />
        <span
          className="font-mono font-bold uppercase"
          style={{ fontSize: 11, letterSpacing: 1 }}
        >
          New
        </span>
        {!isMailOnly && <ChevronDown style={{ width: 11, height: 11 }} />}
      </button>

      {/* Menu — Pencil `cZcJ2`. Anchored to the right edge of the pill
          so the menu drops below it without overflowing the inbox list
          column. Pencil places it at x=184, y=70 relative to the inbox
          frame; relative-to-pill we just sit it `top: calc(100% + 6)`. */}
      {open && !isMailOnly && (
        <div
          role="menu"
          aria-label="Create new"
          className="absolute right-0 z-50 flex flex-col"
          style={{
            top: 'calc(100% + 6px)',
            width: 288,
            background: '#111111',
            borderRadius: 14,
            border: '1px solid var(--color-wm-border)',
            padding: 6,
            gap: 2,
            boxShadow: '0 12px 32px 0 rgba(0,0,0,0.5)',
          }}
        >
          {/* ddHead */}
          <div
            className="flex w-full items-center"
            style={{ padding: '6px 10px 4px 10px' }}
          >
            <span
              className="font-mono font-bold uppercase"
              style={{ fontSize: 9, letterSpacing: 1.5, color: '#6e6e6e' }}
            >
              Create new
            </span>
          </div>

          {items.map((it, idx) => {
            const Icon = it.icon
            const isHover = hovered === idx
            return (
              <button
                key={it.key}
                ref={(el) => {
                  if (el) itemRefs.current[idx] = el
                }}
                role="menuitem"
                type="button"
                onMouseEnter={() => setHovered(idx)}
                onMouseLeave={() =>
                  setHovered((cur) => (cur === idx ? null : cur))
                }
                onFocus={() => setHovered(idx)}
                onBlur={() =>
                  setHovered((cur) => (cur === idx ? null : cur))
                }
                onClick={it.onSelect}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    it.onSelect()
                  } else {
                    onItemKey(e, idx)
                  }
                }}
                className={cn(
                  'flex w-full cursor-pointer items-center text-left transition-colors',
                )}
                style={{
                  gap: 12,
                  padding: 10,
                  borderRadius: 10,
                  background: isHover ? '#1A1A1A' : 'transparent',
                }}
              >
                {/* ic — 32×32 round-square fill #000000 with icon 15. */}
                <span
                  aria-hidden
                  className="flex shrink-0 items-center justify-center"
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 10,
                    background: '#000000',
                  }}
                >
                  <Icon
                    style={{
                      width: 15,
                      height: 15,
                      color: isHover ? 'var(--color-wm-accent)' : '#999999',
                    }}
                  />
                </span>

                {/* col — title + subtitle stacked. */}
                <span className="flex min-w-0 flex-1 flex-col" style={{ gap: 2 }}>
                  <span
                    className="font-mono font-semibold text-wm-text-primary"
                    style={{ fontSize: 13 }}
                  >
                    {it.title}
                  </span>
                  <span
                    className="font-mono"
                    style={{ fontSize: 10, color: '#6e6e6e' }}
                  >
                    {it.subtitle}
                  </span>
                </span>

                {/* kbd — keyboard shortcut chip. */}
                <span
                  aria-hidden
                  className="font-mono font-semibold"
                  style={{
                    padding: '3px 6px',
                    borderRadius: 5,
                    fontSize: 10,
                    background: '#000000',
                    color: '#6e6e6e',
                    border: '1px solid var(--color-wm-border)',
                  }}
                >
                  {it.kbd}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
