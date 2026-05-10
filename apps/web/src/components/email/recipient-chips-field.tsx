'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { useContactSuggestions, type ContactSuggestion } from '@/lib/contacts-search'
import { cn, getInitials, stringToColor } from '@/lib/utils'

interface RecipientChipsFieldProps {
  label: string
  values: string[]
  onChange: (values: string[]) => void
  placeholder?: string
  /// Hide the label column when the row is one of several stacked
  /// (e.g. To above Cc above Bcc).
  className?: string
}

/// Local cache so chips committed via the suggestion dropdown can
/// keep showing the contact's display name + avatar even though the
/// public API stores recipients as plain `string[]`.  Chips committed
/// from raw typing fall back to deriving a friendly name from the
/// email handle ("john.doe@…" → "John Doe").
interface ChipMeta {
  email: string
  name: string
  avatarUrl: string | null
}

/// Recipient input with chips + autocomplete dropdown.
///
/// - Comma / enter / tab / paste-with-trailing-separator commit the
///   buffer to a chip.
/// - onBlur commits any pending buffer so the user can't silently
///   lose half-typed addresses on send.
/// - Backspace on an empty buffer pops the last chip.
/// - Up/down arrows navigate the suggestion dropdown; enter on a
///   highlighted suggestion commits that suggestion (instead of
///   the raw buffer).
/// - Min-h-[40px] keeps the row height stable so the modal doesn't
///   jump when chips wrap to a second visual line.
export function RecipientChipsField({
  label,
  values,
  onChange,
  placeholder,
  className,
}: RecipientChipsFieldProps) {
  const [buffer, setBuffer] = useState('')
  const [focused, setFocused] = useState(false)
  const [highlighted, setHighlighted] = useState(0)
  const [chipMeta, setChipMeta] = useState<Record<string, ChipMeta>>({})
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const { suggestions } = useContactSuggestions(buffer, focused)

  /// Derive a friendly display name from an email handle when the
  /// chip wasn't committed via the suggestion picker (so we have no
  /// metadata).  "john.doe@x.com" → "John Doe", "alex@x.com" → "Alex".
  function nameFromEmail(email: string): string {
    const local = email.split('@')[0]
    return local
      .split(/[._-]+/)
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ') || email
  }

  /// Resolve a chip to its display data — preferring the cached
  /// suggestion metadata, falling back to handle-derived name.
  const chips = useMemo<ChipMeta[]>(
    () =>
      values.map((email) => {
        const cached = chipMeta[email.toLowerCase()]
        if (cached) return cached
        return { email, name: nameFromEmail(email), avatarUrl: null }
      }),
    [values, chipMeta],
  )

  // Keep the highlighted index in range as the suggestion list
  // changes from one keystroke to the next.
  useEffect(() => {
    setHighlighted((h) => (h >= suggestions.length ? 0 : h))
  }, [suggestions.length])

  function commit(raw: string) {
    // Split on commas/semicolons/newlines so paste of "a@x.com,
    // b@y.com" produces two chips, not one. Single-address commits
    // hit the same code path (the split returns one element).
    const parts = raw
      .split(/[,;\n]+/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0 && p.includes('@'))
    if (parts.length === 0) return
    const seen = new Set(values)
    const additions: string[] = []
    for (const p of parts) {
      if (!seen.has(p)) {
        seen.add(p)
        additions.push(p)
      }
    }
    if (additions.length === 0) {
      setBuffer('')
      return
    }
    onChange([...values, ...additions])
    setBuffer('')
  }

  function commitSuggestion(s: ContactSuggestion) {
    if (values.includes(s.email)) {
      setBuffer('')
      return
    }
    // Remember the suggestion's display name + avatar so the chip
    // renders as "Name" + photo, not the raw address.  Keyed by
    // lowercase email so typos in casing still resolve.
    setChipMeta((prev) => ({
      ...prev,
      [s.email.toLowerCase()]: {
        email: s.email,
        name: s.name || s.email,
        avatarUrl: s.avatarUrl ?? null,
      },
    }))
    onChange([...values, s.email])
    setBuffer('')
  }

  function remove(value: string) {
    onChange(values.filter((v) => v !== value))
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && buffer.length === 0 && values.length > 0) {
      remove(values[values.length - 1])
      e.preventDefault()
      return
    }
    if (e.key === 'ArrowDown' && suggestions.length > 0) {
      setHighlighted((h) => Math.min(h + 1, suggestions.length - 1))
      e.preventDefault()
      return
    }
    if (e.key === 'ArrowUp' && suggestions.length > 0) {
      setHighlighted((h) => Math.max(h - 1, 0))
      e.preventDefault()
      return
    }
    if (e.key === 'Enter' || e.key === 'Tab' || e.key === ',' || e.key === ';') {
      // Prefer the highlighted suggestion if the dropdown is open
      // and the user has interacted with it (or we have an exact
      // address match). Otherwise commit the raw buffer.
      if (
        suggestions.length > 0 &&
        focused &&
        (e.key === 'Enter' || e.key === 'Tab')
      ) {
        e.preventDefault()
        commitSuggestion(suggestions[highlighted])
        return
      }
      if (buffer.trim().length > 0) {
        e.preventDefault()
        commit(buffer)
      }
    }
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        // Centered alignment so the chip row sits on the same
        // baseline as the sibling label column, regardless of
        // whether chips have wrapped to a second visual line.
        'relative flex items-center gap-2 px-4 py-1.5',
        className,
      )}
    >
      {label && (
        <span className="w-14 shrink-0 font-mono text-[11px] text-wm-text-muted">
          {label}
        </span>
      )}
      <div className="flex flex-1 flex-wrap items-center" style={{ gap: 6 }}>
        {chips.map((chip) => {
          const initials = getInitials(chip.name)
          const bg = stringToColor(chip.name || chip.email)
          return (
            <span
              key={chip.email}
              className="inline-flex items-center font-mono"
              style={{
                gap: 8,
                padding: '3px 10px 3px 3px',
                borderRadius: 14,
                background: '#000000',
                border: '1px solid var(--color-wm-border)',
                fontSize: 12,
              }}
              title={chip.email}
            >
              <span
                aria-hidden
                className="flex items-center justify-center rounded-full font-mono font-bold text-white"
                style={{
                  width: 22,
                  height: 22,
                  fontSize: 10,
                  backgroundColor: bg,
                }}
              >
                {initials || '?'}
              </span>
              <span className="text-wm-text-primary">{chip.name}</span>
              <X
                className="h-3 w-3 cursor-pointer text-wm-text-muted hover:text-wm-text-secondary"
                onClick={() => remove(chip.email)}
              />
            </span>
          )
        })}
        <input
          ref={inputRef}
          type="text"
          // Suppress every browser's contact / email autofill — the
          // app surfaces its own deterministic suggestion dropdown
          // and the Chrome / Safari autofill panel was overlapping
          // it.  `autoComplete="email"` would TRIGGER autofill;
          // `"off"` is honored by Firefox; Chrome only stops on
          // unrecognised tokens like "new-password" or random
          // strings, hence the belt-and-suspenders combo.
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          name={`recipient-${label || 'to'}-${Math.random().toString(36).slice(2, 7)}`}
          data-1p-ignore
          data-lpignore="true"
          value={buffer}
          onChange={(e) => {
            const v = e.target.value
            // Trailing separator paste / IME quirk: commit on the
            // change event too, in case onKeyDown didn't fire.
            if (v.endsWith(',') || v.endsWith(';')) {
              commit(v)
              return
            }
            setBuffer(v)
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            // Defer the blur slightly so a click on a suggestion can
            // commit it before the dropdown unmounts.
            setTimeout(() => {
              setFocused(false)
              if (buffer.trim().length > 0) commit(buffer)
            }, 120)
          }}
          placeholder={values.length === 0 ? placeholder : ''}
          className="min-w-[100px] flex-1 bg-transparent font-mono text-xs text-wm-text-primary placeholder:text-wm-text-muted outline-none"
        />
      </div>

      {focused && suggestions.length > 0 && (
        <div
          // Contact picker — surfaces below the chip input. z-[60] beats
          // every existing modal layer so the dropdown stays visible
          // above the floating-compose chrome.  Width 320 gives every
          // row room for a 32-px avatar + name + email + role chip
          // without truncating, and the radius/border match the
          // newDropdown chrome (`cZcJ2`).
          className="absolute left-0 top-full z-[60]"
          style={{
            marginTop: 6,
            width: 320,
            background: '#111111',
            borderRadius: 12,
            border: '1px solid var(--color-wm-border)',
            padding: 6,
            boxShadow: '0 12px 32px 0 rgba(0,0,0,0.5)',
          }}
          // Prevent the input's onBlur from firing on click — we
          // commit explicitly via onMouseDown below.
          onMouseDown={(e) => e.preventDefault()}
        >
          {suggestions.map((s, i) => {
            const name = s.name || s.email
            const initials = getInitials(name)
            const bg = stringToColor(name)
            return (
              <button
                key={s.id}
                type="button"
                className={cn(
                  'flex w-full items-center text-left transition-colors',
                  i === highlighted ? 'bg-wm-surface-hover' : 'hover:bg-wm-surface-hover',
                )}
                style={{ gap: 12, padding: 8, borderRadius: 8 }}
                onMouseEnter={() => setHighlighted(i)}
                onClick={() => {
                  commitSuggestion(s)
                  inputRef.current?.focus()
                }}
              >
                <span
                  aria-hidden
                  className="flex shrink-0 items-center justify-center rounded-full font-mono font-bold text-white"
                  style={{
                    width: 32,
                    height: 32,
                    fontSize: 12,
                    backgroundColor: bg,
                  }}
                >
                  {initials || '?'}
                </span>
                <span className="min-w-0 flex-1 flex flex-col" style={{ gap: 1 }}>
                  <span
                    className="truncate font-mono font-semibold text-wm-text-primary"
                    style={{ fontSize: 12 }}
                  >
                    {s.name || s.email}
                  </span>
                  {s.name && (
                    <span
                      className="truncate font-mono"
                      style={{ fontSize: 10, color: '#6e6e6e' }}
                    >
                      {s.email}
                    </span>
                  )}
                </span>
                <span
                  className="shrink-0 font-mono font-bold uppercase"
                  style={{ fontSize: 9, letterSpacing: 1, color: '#6e6e6e' }}
                >
                  {s.source === 'org_member'
                    ? 'team'
                    : s.source === 'recent'
                      ? 'recent'
                      : 'contact'}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
