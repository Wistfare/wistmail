import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  icon?: React.ReactNode
}

// Pencil specs:
// ButtonPrimary: bg #BFFF00, text #000 weight 600, padding [8,14], gap 6
// ButtonSecondary: 1px #1A1A1A border, text #999 weight normal, padding [8,14], gap 6
// ButtonDanger: 1px #441111 border, text #FF4444 weight normal, padding [8,14], gap 6
const variantStyles = {
  primary: 'bg-wm-accent text-wm-text-on-accent font-semibold hover:bg-wm-accent-hover',
  secondary: 'border border-wm-border text-wm-text-secondary hover:bg-wm-surface-hover hover:text-wm-text-primary',
  danger: 'border border-[#441111] text-wm-error hover:bg-wm-error/10',
  ghost: 'text-wm-text-secondary hover:bg-wm-surface-hover',
}

// gap-1.5 = 6px (matches Pencil), padding x=14px (px-3.5) y=8px (py-2)
const sizeStyles = {
  sm: 'px-2.5 py-1.5 text-[11px] gap-1',
  md: 'px-3.5 py-2 text-xs gap-1.5',
  lg: 'px-4 py-2.5 text-sm gap-2',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, icon, children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          'relative inline-flex items-center justify-center font-mono transition-colors cursor-pointer overflow-hidden',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          variantStyles[variant],
          sizeStyles[size],
          loading && 'pointer-events-none',
          className,
        )}
        disabled={disabled || loading}
        {...props}
      >
        {/* Shimmer overlay when loading */}
        {loading && (
          <span className="absolute inset-0 overflow-hidden">
            <span className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          </span>
        )}

        <span className={cn('inline-flex items-center justify-center gap-[inherit]', loading && 'opacity-70')}>
          {loading ? (
            <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            icon
          )}
          {children}
        </span>
      </button>
    )
  },
)
Button.displayName = 'Button'
