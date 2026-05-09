import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  size?: 'sm' | 'md' | 'lg'
  variant?: 'ghost' | 'surface' | 'accent'
  /** Required for accessibility — icon-only buttons must label themselves. */
  'aria-label': string
  active?: boolean
}

const sizeStyles = {
  sm: 'h-7 w-7',
  md: 'h-8 w-8',
  lg: 'h-10 w-10',
}

const variantStyles = {
  ghost: 'text-wm-text-secondary hover:bg-wm-surface-hover hover:text-wm-text-primary',
  surface: 'border border-wm-border bg-wm-surface text-wm-text-secondary hover:bg-wm-surface-hover hover:text-wm-text-primary',
  accent: 'bg-wm-accent text-wm-text-on-accent hover:bg-wm-accent-hover',
}

/**
 * Square, icon-only button. Used in toolbars (compose actions, email row
 * actions, calendar nav arrows, drawer close buttons).
 *
 * Pencil reference: not a formal component but appears throughout
 * toolbars. Spacing/visual matches the IconRail and surface buttons.
 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, size = 'md', variant = 'ghost', active, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        type="button"
        className={cn(
          'inline-flex items-center justify-center transition-colors cursor-pointer',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          sizeStyles[size],
          variantStyles[variant],
          active && variant !== 'accent' && 'bg-wm-surface-hover text-wm-text-primary',
          className,
        )}
        {...props}
      >
        {children}
      </button>
    )
  },
)
IconButton.displayName = 'IconButton'
