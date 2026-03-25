import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

export interface InputFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
  icon?: React.ReactNode
}

export const InputField = forwardRef<HTMLInputElement, InputFieldProps>(
  ({ className, label, error, hint, icon, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-2">
        {label && (
          <label className="font-mono text-xs font-medium text-wm-text-secondary">{label}</label>
        )}
        <div
          className={cn(
            'flex items-center gap-2.5 border bg-wm-surface px-4 py-3',
            'transition-colors focus-within:border-wm-accent focus-within:ring-1 focus-within:ring-wm-accent/30',
            error ? 'border-wm-error' : 'border-wm-border',
          )}
        >
          {icon && <span className="text-wm-text-muted">{icon}</span>}
          <input
            ref={ref}
            className={cn(
              'flex-1 bg-transparent font-mono text-sm text-wm-text-primary',
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
