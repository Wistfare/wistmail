import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  icon?: React.ReactNode
}

const variantStyles = {
  primary: 'bg-wm-accent text-wm-text-on-accent font-semibold hover:bg-wm-accent-hover',
  secondary: 'border border-wm-border text-wm-text-secondary hover:bg-wm-surface-hover',
  danger: 'border border-wm-error/30 text-wm-error hover:bg-wm-error/10',
  ghost: 'text-wm-text-secondary hover:bg-wm-surface-hover',
}

const sizeStyles = {
  sm: 'px-2.5 py-1.5 text-xs gap-1.5',
  md: 'px-3.5 py-2 text-xs gap-2',
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

        <span className={cn('inline-flex items-center justify-center gap-2', loading && 'opacity-70')}>
          {loading ? (
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
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
