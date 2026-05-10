'use client'

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
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
  /// Emails already committed in sibling fields (e.g. when this is
  /// the CC field, pass [...toChips, ...bccChips]).  Suggestions
  /// matching any address in this list are filtered out so the user
  /// never sees the same person across multiple fields.
  excludedEmails?: string[]
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
/// - Chips render in a single row.  When the row overflows, a "+N"
///   avatar replaces the trailing chips and opens an overflow
///   popover where the user can review or remove the hidden ones.
export function RecipientChipsField({
  label,
  values,
  onChange,
  placeholder,
  className,
  excludedEmails,
}: RecipientChipsFieldProps) {
  const [buffer, setBuffer] = useState('')
  const [focused, setFocused] = useState(false)
  const [highlighted, setHighlighted] = useState(0)
  const [chipMeta, setChipMeta] = useState<Record<string, ChipMeta>>({})
  const [overflowOpen, setOverflowOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const chipRowRef = useRef<HTMLDivElement>(null)

  const { suggestions: rawSuggestions } = useContactSuggestions(buffer, focused)

  /// Filter out anyone the user has already added in a sibling field
  /// — the user explicitly asked for cross-field deduplication so they
  /// never see the same recipient as a TO + CC + BCC suggestion.  Also
  /// hide chips already committed in THIS field so the dropdown
  /// doesn't keep proposing duplicates.
  const suggestions = useMemo(() => {
    const blocked = new Set<string>()
    for (const v of values) blocked.add(v.toLowerCase())
    if (excludedEmails) {
      for (const v of excludedEmails) blocked.add(v.toLowerCase())
    }
    return rawSuggestions.filter((s) => !blocked.has(s.email.toLowerCase()))
  }, [rawSuggestions, values, excludedEmails])

  /// Derive a friendly display name from an email handle when the
  /// chip wasn't committed via the suggestion picker (so we have no
  /// metadata).  "john.doe@x.com" → "John Doe", "alex@x.com" → "Alex".
  const nameFromEmail = useCallback((email: string): string => {
    const local = email.split('@')[0]
    return (
      local
        .split(/[._-]+/)
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ') || email
    )
  }, [])

  /// Resolve a chip to its display data — preferring the cached
  /// suggestion metadata, falling back to handle-derived name.
  const chips = useMemo<ChipMeta[]>(
    () =>
      values.map((email) => {
        const cached = chipMeta[email.toLowerCase()]
        if (cached) return cached
        return { email, name: nameFromEmail(email), avatarUrl: null }
      }),
    [values, chipMeta, nameFromEmail],
  )

  // Keep the highlighted index in range as the suggestion list
  // changes from one keystroke to the next.
  useEffect(() => {
    setHighlighted((h) => (h >= suggestions.length ? 0 : h))
  }, [suggestions.length])

  // ── Single-row overflow detection ───────────────────────────────
  // Pencil's compose chip row is one line tall.  When the user has
  // added more recipients than fit, we collapse the trailing chips
  // into a "+N" overflow pill that opens an avatar list popover.
  // We measure widths after each render in a useLayoutEffect so the
  // browser doesn't paint a wrapped row before we collapse it.
  const [visibleCount, setVisibleCount] = useState(values.length)
  const measureOverflow = useCallback(() => {
    const row = chipRowRef.current
    if (!row) return
    const rowWidth = row.clientWidth
    if (rowWidth === 0) return
    const reserveForInput = 110 // min-w of the typing buffer
    const reserveForOverflowPill = 56 // approximate "+N" pill width
    const gap = 6
    let used = 0
    let fit = 0
    const chipNodes = row.querySelectorAll<HTMLElement>('[data-chip-index]')
    for (const node of chipNodes) {
      const w = node.offsetWidth + gap
      const remainingChips = chipNodes.length - fit - 1
      // Leave room for the input AND the overflow pill if any chips
      // remain after this one.
      const reserve =
        reserveForInput +
        (remainingChips > 0 ? reserveForOverflowPill + gap : 0)
      if (used + w > rowWidth - reserve) break
      used += w
      fit++
    }
    setVisibleCount(fit)
  }, [])

  useLayoutEffect(() => {
    measureOverflow()
  }, [chips, measureOverflow])

  useEffect(() => {
    const row = chipRowRef.current
    if (!row || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => measureOverflow())
    ro.observe(row)
    return () => ro.disconnect()
  }, [measureOverflow])

  function commit(raw: string) {
    // Split on commas/semicolons/newlines so paste of "a@x.com,
    // b@y.com" produces two chips, not one. Single-address commits
    // hit the same code path (the split returns one element).
    const parts = raw
      .split(/[,;\n]+/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0 && p.includes('@'))
    if (parts.length === 0) return
    const seen = new Set(values.map((v) => v.toLowerCase()))
    const additions: string[] = []
    for (const p of parts) {
      const key = p.toLowerCase()
      if (!seen.has(key)) {
        seen.add(key)
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
    if (values.some((v) => v.toLowerCase() === s.email.toLowerCase())) {
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

  const visibleChips = chips.slice(0, visibleCount)
  const hiddenChips = chips.slice(visibleCount)
  const showOverflow = hiddenChips.length > 0

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

      {/* Autofill honeypot — Chrome's saved-addresses heuristic
          inserts its dropdown on the FIRST email-shaped input it
          finds inside a form-like context.  Drop a hidden, off-
          screen, autoComplete-compatible decoy in front of the real
          input so Chrome attaches its panel here instead of on the
          chip field.  `tabIndex=-1` keeps it out of keyboard
          navigation; `aria-hidden` + display:none keeps it invisible
          to assistive tech but reachable to Chrome's autofill scan. */}
      <input
        type="text"
        autoComplete="email"
        tabIndex={-1}
        aria-hidden
        style={{
          position: 'absolute',
          left: -9999,
          top: -9999,
          width: 1,
          height: 1,
          opacity: 0,
          pointerEvents: 'none',
        }}
      />

      <div
        ref={chipRowRef}
        className="relative flex min-w-0 flex-1 flex-nowrap items-center overflow-hidden"
        style={{ gap: 6 }}
      >
        {visibleChips.map((chip, i) => (
          <Chip
            key={chip.email}
            chip={chip}
            index={i}
            onRemove={() => remove(chip.email)}
          />
        ))}
        {/* Pre-render hidden chips off-screen at full size so the
            measurement loop above sees their real width.  They're
            invisible (zero opacity, position absolute) so the user
            never sees a flash. */}
        {hiddenChips.map((chip, i) => (
          <span
            key={`measure-${chip.email}`}
            data-chip-index={visibleCount + i}
            aria-hidden
            style={{
              position: 'absolute',
              left: -9999,
              top: -9999,
              opacity: 0,
              pointerEvents: 'none',
            }}
          >
            <Chip chip={chip} index={visibleCount + i} onRemove={() => {}} />
          </span>
        ))}
        {showOverflow && (
          <button
            type="button"
            onClick={() => setOverflowOpen((v) => !v)}
            aria-haspopup="dialog"
            aria-expanded={overflowOpen}
            aria-label={`${hiddenChips.length} more recipient${
              hiddenChips.length === 1 ? '' : 's'
            }`}
            className="inline-flex shrink-0 cursor-pointer items-center justify-center font-mono font-bold text-wm-text-primary transition-colors hover:bg-wm-surface-hover"
            style={{
              gap: 4,
              padding: '3px 10px 3px 4px',
              borderRadius: 14,
              background: 'var(--color-wm-surface)',
              border: '1px solid var(--color-wm-border)',
              fontSize: 12,
            }}
            title={`${hiddenChips.length} more`}
          >
            <span
              aria-hidden
              className="flex items-center justify-center rounded-full font-mono font-bold text-wm-text-secondary"
              style={{
                width: 22,
                height: 22,
                fontSize: 10,
                background: '#000000',
                border: '1px solid var(--color-wm-border)',
              }}
            >
              +{hiddenChips.length}
            </span>
            more
          </button>
        )}
        <input
          ref={inputRef}
          // Autofill suppression — Chrome's saved-addresses panel was
          // popping over our own contact picker because the input
          // looked like a classic email field.  Two-pronged defence:
          //   1. `readOnly` on mount so Chrome's heuristic skips the
          //      field — we strip the attribute on first focus so
          //      typing still works.
          //   2. random `name` + 1Password / LastPass ignore hints +
          //      the off-screen autoComplete="email" honeypot above.
          // Plus `type="search"`, which Chrome / Safari classify as
          // non-fillable.
          type="search"
          readOnly
          onFocus={(e) => {
            e.currentTarget.removeAttribute('readonly')
            setFocused(true)
          }}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          name={`recipient-${label || 'to'}-${Math.random().toString(36).slice(2, 7)}`}
          data-1p-ignore
          data-lpignore="true"
          enterKeyHint="enter"
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
          onBlur={() => {
            // Defer the blur slightly so a click on a suggestion can
            // commit it before the dropdown unmounts.
            setTimeout(() => {
              setFocused(false)
              if (buffer.trim().length > 0) commit(buffer)
            }, 120)
          }}
          placeholder={values.length === 0 ? placeholder : ''}
          className="min-w-[110px] flex-1 bg-transparent font-mono text-xs text-wm-text-primary placeholder:text-wm-text-muted outline-none [&::-webkit-search-cancel-button]:appearance-none"
        />
      </div>

      {/* Suggestion dropdown — same chrome as before, just sourced
          from the post-filtered `suggestions` list. */}
      {focused && suggestions.length > 0 && (
        <div
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

      {/* Overflow popover — surfaces below the +N chip and lists
          every hidden recipient with the same row layout the
          suggestion dropdown uses (avatar + name + email).  Each
          row carries an X to remove the recipient inline. */}
      {overflowOpen && hiddenChips.length > 0 && (
        <>
          <div
            className="fixed inset-0 z-[55]"
            aria-hidden
            onClick={() => setOverflowOpen(false)}
          />
          <div
            role="dialog"
            aria-label="More recipients"
            className="absolute right-0 top-full z-[60]"
            style={{
              marginTop: 6,
              width: 320,
              background: '#111111',
              borderRadius: 12,
              border: '1px solid var(--color-wm-border)',
              padding: 6,
              boxShadow: '0 12px 32px 0 rgba(0,0,0,0.5)',
            }}
          >
            <p
              className="font-mono font-bold uppercase"
              style={{
                fontSize: 9,
                letterSpacing: 1.5,
                color: '#6e6e6e',
                padding: '6px 10px 8px 10px',
              }}
            >
              {hiddenChips.length} more recipient
              {hiddenChips.length === 1 ? '' : 's'}
            </p>
            {hiddenChips.map((chip) => {
              const initials = getInitials(chip.name)
              const bg = stringToColor(chip.name || chip.email)
              return (
                <div
                  key={chip.email}
                  className="flex w-full items-center"
                  style={{ gap: 12, padding: 8, borderRadius: 8 }}
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
                  <span
                    className="min-w-0 flex-1 flex flex-col"
                    style={{ gap: 1 }}
                  >
                    <span
                      className="truncate font-mono font-semibold text-wm-text-primary"
                      style={{ fontSize: 12 }}
                    >
                      {chip.name}
                    </span>
                    <span
                      className="truncate font-mono"
                      style={{ fontSize: 10, color: '#6e6e6e' }}
                    >
                      {chip.email}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      remove(chip.email)
                      // Close once the last hidden recipient is gone.
                      if (hiddenChips.length === 1) setOverflowOpen(false)
                    }}
                    className="shrink-0 cursor-pointer text-wm-text-muted hover:text-wm-error"
                    aria-label={`Remove ${chip.email}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

/// Single recipient pill — Pencil `frTo` chip in `Qe0q2`.
function Chip({
  chip,
  index,
  onRemove,
}: {
  chip: ChipMeta
  index: number
  onRemove: () => void
}) {
  const initials = getInitials(chip.name)
  const bg = stringToColor(chip.name || chip.email)
  return (
    <span
      data-chip-index={index}
      className="inline-flex shrink-0 items-center font-mono"
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
        onClick={onRemove}
      />
    </span>
  )
}
