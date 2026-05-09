'use client'

import { useEffect, useId, useRef } from 'react'
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
  /** Show the input boxes with a lime active border (vs neutral). */
  status?: 'default' | 'error' | 'success'
}

/**
 * 6-digit OTP input row.
 *
 * Pencil reference: `MFAChallengeV3.codeRow` — six 56×56 cells, gap 8,
 * cornerRadius 12, bg #111, 1px #1A1A1A border, JetBrains Mono 24px 700
 * centered. Active cell (focused / next-to-fill) gets a lime border.
 *
 * Behaviour:
 * - Each cell is its own `<input>` so screen readers and password managers
 *   work; we coordinate them via refs and forward arrow / backspace nav.
 * - Pasting a full code into any cell distributes the digits and focuses
 *   the last cell.
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
      // Clear current; if already empty, move back.
      const cur = digits[idx].trim()
      if (!cur) {
        e.preventDefault()
        focusCell(idx - 1)
        setAt(Math.max(0, idx - 1), '')
      } else {
        setAt(idx, '')
      }
    } else if (e.key === 'Enter') {
      // Trigger onComplete on Enter even if not all cells are filled.
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
    let cleaned = inputMode === 'numeric' ? raw.replace(/\D/g, '') : raw
    if (!cleaned) {
      setAt(idx, '')
      return
    }
    // Multi-char insert (autofill via password manager) → distribute.
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

  const borderForCell = (idx: number, hasValue: boolean) => {
    if (status === 'error') return 'border-wm-error'
    if (status === 'success') return 'border-wm-accent'
    if (hasValue) return 'border-wm-accent'
    // First empty cell highlighted as the next-to-type.
    const firstEmpty = digits.findIndex((d) => !d.trim())
    if (idx === firstEmpty) return 'border-wm-accent'
    return 'border-wm-border'
  }

  return (
    <div className="flex w-full justify-center gap-2">
      {Array.from({ length }).map((_, idx) => {
        const ch = digits[idx].trim()
        return (
          <input
            key={idx}
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
            onFocus={(e) => e.currentTarget.select()}
            maxLength={1}
            aria-label={`Digit ${idx + 1} of ${length}`}
            className={cn(
              'h-14 w-14 rounded-[12px] border bg-wm-surface text-center font-mono text-[24px] font-bold text-wm-text-primary outline-none transition-colors',
              'focus:border-wm-accent focus:ring-1 focus:ring-wm-accent/40 disabled:opacity-50',
              borderForCell(idx, !!ch),
            )}
          />
        )
      })}
    </div>
  )
}
