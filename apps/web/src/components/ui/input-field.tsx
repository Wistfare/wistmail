import { forwardRef, useId } from 'react'
import { cn } from '@/lib/utils'

export interface InputFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
  icon?: React.ReactNode
}

// Pencil spec: padding [10, 14] (py-2.5 px-3.5), gap 10 (gap-2.5),
// bg #111111, 1px #1A1A1A border, value text 13px JetBrains Mono.
// Stacked-label variant: label is "EMAIL" — JetBrains Mono 11px 500 #999, 6px below to field.
export const InputField = forwardRef<HTMLInputElement, InputFieldProps>(
  ({ className, label, error, hint, icon, id, ...props }, ref) => {
    // Associate the visible label with the underlying input so screen
    // readers (and `getByLabelText` in tests) can find it. Caller-supplied
    // `id` wins; otherwise we mint a stable React useId.
    const reactId = useId()
    const inputId = id ?? reactId
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="font-mono text-[11px] font-medium uppercase tracking-wider text-wm-text-secondary"
          >
            {label}
          </label>
        )}
        <div
          className={cn(
            'flex items-center gap-2.5 border bg-wm-surface px-3.5 py-2.5',
            'transition-colors focus-within:border-wm-accent focus-within:ring-1 focus-within:ring-wm-accent/30',
            error ? 'border-wm-error' : 'border-wm-border',
          )}
        >
          {icon && <span className="text-wm-text-muted">{icon}</span>}
          <input
            ref={ref}
            id={inputId}
            className={cn(
              'flex-1 bg-transparent font-mono text-[13px] text-wm-text-primary',
              'placeholder:text-wm-text-muted outline-none',
              className,
            )}
            {...props}
          />
        </div>
        {error && <p className="font-mono text-xs text-wm-error">{error}</p>}
        {hint && !error && <p className="font-mono text-xs text-wm-text-muted">{hint}</p>}
      </div>
    )
  },
)
InputField.displayName = 'InputField'
