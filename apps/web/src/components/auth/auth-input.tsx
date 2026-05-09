'use client'

import { forwardRef, useId, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface AuthInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string
  /** Adornment shown left of the input (icon). */
  icon?: React.ReactNode
  /** Trailing element shown right of the input (e.g. "FORGOT?" link). */
  trailingLabel?: React.ReactNode
  error?: string
  /** Render password reveal toggle when type='password'. */
  reveal?: boolean
}

/**
 * Stacked label-above-input field — Pencil `LoginV3.fEmail / fPwd`.
 *
 * - label: JetBrains Mono 9px 700 letterSpacing 1.5 #6E6E6E
 * - input box: bg #111, height 46, cornerRadius 10, padding [0, 14], gap 10,
 *   1px stroke #1A1A1A (lime when focused or filled — matches the "active"
 *   field treatment on Pencil)
 */
export const AuthInput = forwardRef<HTMLInputElement, AuthInputProps>(
  ({ className, label, icon, trailingLabel, error, reveal, id, type, ...props }, ref) => {
    const auto = useId()
    const inputId = id ?? auto
    const [revealed, setRevealed] = useState(false)
    const isPassword = type === 'password'
    const effectiveType = isPassword && reveal && revealed ? 'text' : type
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <label
            htmlFor={inputId}
            className="font-mono text-[9px] font-bold uppercase tracking-[1.5px] text-wm-text-tertiary"
          >
            {label}
          </label>
          {trailingLabel}
        </div>
        <div
          className={cn(
            'flex h-[46px] items-center gap-2.5 rounded-[10px] border bg-wm-surface px-3.5',
            'transition-colors focus-within:border-wm-accent',
            error ? 'border-wm-error' : 'border-wm-border',
          )}
        >
          {icon && <span className="text-wm-text-muted">{icon}</span>}
          <input
            id={inputId}
            ref={ref}
            type={effectiveType}
            className={cn(
              'min-w-0 flex-1 bg-transparent font-mono text-[13px] text-wm-text-primary',
              'placeholder:text-wm-text-muted outline-none',
              className,
            )}
            {...props}
          />
          {isPassword && reveal && (
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setRevealed((v) => !v)}
              aria-label={revealed ? 'Hide password' : 'Show password'}
              className="cursor-pointer text-wm-text-muted hover:text-wm-text-secondary"
            >
              {revealed ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </button>
          )}
        </div>
        {error && <p className="font-mono text-[11px] text-wm-error">{error}</p>}
      </div>
    )
  },
)
AuthInput.displayName = 'AuthInput'
