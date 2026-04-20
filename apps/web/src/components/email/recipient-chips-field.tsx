'use client'

import { useEffect, useRef, useState } from 'react'
import { Mail, X } from 'lucide-react'
import { useContactSuggestions, type ContactSuggestion } from '@/lib/contacts-search'
import { cn } from '@/lib/utils'

interface RecipientChipsFieldProps {
  label: string
  values: string[]
  onChange: (values: string[]) => void
  placeholder?: string
  /// Hide the label column when the row is one of several stacked
  /// (e.g. To above Cc above Bcc).
  className?: string
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
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const { suggestions } = useContactSuggestions(buffer, focused)

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
        'relative flex min-h-[40px] items-start gap-2 px-4 py-2',
        className,
      )}
    >
      <span className="mt-1 w-14 shrink-0 font-mono text-[11px] text-wm-text-muted">
        {label}
      </span>
      <div className="flex flex-1 flex-wrap items-center gap-1">
        {values.map((chip) => (
          <span
            key={chip}
            className="flex items-center gap-1 border border-wm-border bg-wm-surface px-1.5 py-0.5 font-mono text-[10px] text-wm-text-primary"
          >
            {chip}
            <X
              className="h-2.5 w-2.5 cursor-pointer text-wm-text-muted hover:text-wm-text-secondary"
              onClick={() => remove(chip)}
            />
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
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
          // z-[60] beats every existing modal layer (z-50 max), so the
          // dropdown stays visible above the floating-compose chrome.
          className="absolute left-20 top-full z-[60] mt-1 w-[calc(100%-6rem)] max-w-md border border-wm-border bg-wm-surface shadow-lg"
          // Prevent the input's onBlur from firing on click — we
          // commit explicitly via onMouseDown below.
          onMouseDown={(e) => e.preventDefault()}
        >
          {suggestions.map((s, i) => (
            <button
              key={s.id}
              type="button"
              className={cn(
                'flex w-full items-center gap-3 px-3 py-2 text-left transition-colors',
                i === highlighted
                  ? 'bg-wm-surface-hover'
                  : 'hover:bg-wm-surface-hover',
              )}
              onMouseEnter={() => setHighlighted(i)}
              onClick={() => {
                commitSuggestion(s)
                inputRef.current?.focus()
              }}
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center bg-wm-accent/15">
                <Mail className="h-3.5 w-3.5 text-wm-accent" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-medium text-wm-text-primary">
                  {s.name || s.email}
                </p>
                {s.name && (
                  <p className="truncate font-mono text-[10px] text-wm-text-muted">
                    {s.email}
                  </p>
                )}
              </div>
              <span className="font-mono text-[9px] uppercase text-wm-text-muted">
                {s.source === 'org_member'
                  ? 'team'
                  : s.source === 'recent'
                    ? 'recent'
                    : 'contact'}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
