'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

export interface OtpInputProps {
  /** Number of digits. Defaults to 6. */
  length?: number
  value: string
  onChange: (value: string) => void
  /** Called when the user types the final digit (handy for auto-submit). */
  onComplete?: (value: string) => void
  autoFocus?: boolean
  disabled?: boolean
  inputMode?: 'numeric' | 'text'
  /** Override the default neutral border treatment. */
  status?: 'default' | 'error' | 'success'
}

/**
 * 6-cell OTP input.
 *
 * Pencil reference: `MFAChallengeV3.codeRow` (`QdqfU`).
 *   - Each cell: 64×64, cornerRadius 10, fill #111
 *   - Filled digit cell: 1px lime stroke, content JetBrains Mono 24/700 white
 *   - Cursor cell (currently focused, empty): 2px lime stroke, content
 *     "|" 26/500 lime
 *   - Empty placeholder cell: 1px #1A1A1A stroke, content "·" 24/500 #404040
 *   - Row layout: gap 8, justifyContent center, fill_container width
 *
 * Each cell is its own `<input>` so password managers + screen readers
 * work; we coordinate via refs and forward arrow / backspace nav. Pasting
 * a full code into any cell distributes the digits and focuses the last
 * cell.
 */
export function OtpInput({
  length = 6,
  value,
  onChange,
  onComplete,
  autoFocus,
  disabled,
  inputMode = 'numeric',
  status = 'default',
}: OtpInputProps) {
  const id = useId()
  const cellsRef = useRef<HTMLInputElement[]>([])
  const [focusedIdx, setFocusedIdx] = useState<number | null>(null)
  const digits = (value ?? '').padEnd(length, ' ').slice(0, length).split('')

  useEffect(() => {
    if (autoFocus) cellsRef.current[0]?.focus()
  }, [autoFocus])

  function setAt(idx: number, char: string) {
    const arr = (value ?? '').padEnd(length, ' ').split('')
    arr[idx] = char
    const next = arr.join('').replace(/\s+$/, '')
    onChange(next)
    if (next.length === length && next.trim().length === length) {
      onComplete?.(next)
    }
  }

  function focusCell(idx: number) {
    const i = Math.max(0, Math.min(length - 1, idx))
    cellsRef.current[i]?.focus()
    cellsRef.current[i]?.select()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>, idx: number) {
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      focusCell(idx - 1)
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      focusCell(idx + 1)
    } else if (e.key === 'Backspace') {
      const cur = digits[idx].trim()
      if (!cur) {
        e.preventDefault()
        focusCell(idx - 1)
        setAt(Math.max(0, idx - 1), '')
      } else {
        setAt(idx, '')
      }
    } else if (e.key === 'Enter') {
      const trimmed = (value ?? '').trim()
      if (trimmed.length === length) onComplete?.(trimmed)
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>, idx: number) {
    const pasted = e.clipboardData.getData('text').replace(/\s+/g, '')
    if (!pasted) return
    e.preventDefault()
    const filtered = inputMode === 'numeric' ? pasted.replace(/\D/g, '') : pasted
    const next = (value ?? '').slice(0, idx) + filtered.slice(0, length - idx)
    const truncated = next.slice(0, length)
    onChange(truncated)
    if (truncated.length === length) {
      onComplete?.(truncated)
      focusCell(length - 1)
    } else {
      focusCell(truncated.length)
    }
  }

  function handleInput(e: React.FormEvent<HTMLInputElement>, idx: number) {
    const raw = (e.target as HTMLInputElement).value
    const cleaned = inputMode === 'numeric' ? raw.replace(/\D/g, '') : raw
    if (!cleaned) {
      setAt(idx, '')
      return
    }
    if (cleaned.length > 1) {
      const next = (value ?? '').slice(0, idx) + cleaned.slice(0, length - idx)
      const truncated = next.slice(0, length)
      onChange(truncated)
      if (truncated.length === length) {
        onComplete?.(truncated)
        focusCell(length - 1)
      } else {
        focusCell(truncated.length)
      }
      return
    }
    setAt(idx, cleaned)
    focusCell(idx + 1)
  }

  /// Compute Pencil's tri-state per-cell border:
  ///   filled  → 1px lime
  ///   focused → 2px lime  (the "cursor" cell)
  ///   empty   → 1px #1A1A1A neutral
  function cellStyle(idx: number, ch: string): React.CSSProperties {
    const isFilled = !!ch
    const isFocused = focusedIdx === idx
    if (status === 'error') {
      return { border: '1px solid var(--color-wm-error)' }
    }
    if (isFocused && !isFilled) {
      return { border: '2px solid var(--color-wm-accent)' }
    }
    if (isFilled) {
      return { border: '1px solid var(--color-wm-accent)' }
    }
    return { border: '1px solid var(--color-wm-border)' }
  }

  return (
    <div
      className="flex w-full justify-center"
      // Pencil codeRow gap 8.
      style={{ gap: 8 }}
    >
      {Array.from({ length }).map((_, idx) => {
        const ch = digits[idx].trim()
        const isFocused = focusedIdx === idx
        const isEmptyAndUnfocused = !ch && !isFocused
        return (
          <div
            key={idx}
            className="relative"
            style={{ width: 64, height: 64 }}
          >
            {/* Empty placeholder dot — Pencil shows "·" in #404040 in
                cells that are neither filled nor the focus cursor. */}
            {isEmptyAndUnfocused && (
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 flex items-center justify-center font-mono"
                style={{ fontSize: 24, fontWeight: 500, color: '#404040' }}
              >
                ·
              </span>
            )}
            <input
              ref={(el) => {
                if (el) cellsRef.current[idx] = el
              }}
              id={`${id}-${idx}`}
              inputMode={inputMode}
              autoComplete={idx === 0 ? 'one-time-code' : 'off'}
              disabled={disabled}
              value={ch}
              onChange={(e) => handleInput(e, idx)}
              onKeyDown={(e) => handleKeyDown(e, idx)}
              onPaste={(e) => handlePaste(e, idx)}
              onFocus={(e) => {
                setFocusedIdx(idx)
                e.currentTarget.select()
              }}
              onBlur={() => setFocusedIdx((cur) => (cur === idx ? null : cur))}
              maxLength={1}
              aria-label={`Digit ${idx + 1} of ${length}`}
              className={cn(
                'h-full w-full bg-wm-surface text-center font-mono text-[24px] font-bold text-wm-text-primary outline-none transition-colors',
                'disabled:opacity-50',
              )}
              style={{ borderRadius: 10, ...cellStyle(idx, ch) }}
            />
          </div>
        )
      })}
    </div>
  )
}
