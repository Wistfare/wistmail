import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

export interface AuthButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * Visual style.
   * - primary: lime fill, black text, 12px shadow — Pencil `signBtn / contBtn`.
   * - secondary: bg #111, 1px #1A1A1A border — Pencil `ssoBtn`.
   * - ghost: transparent, no border.
   */
  variant?: 'primary' | 'secondary' | 'ghost'
  loading?: boolean
  icon?: React.ReactNode
  trailingIcon?: React.ReactNode
}

/**
 * Tall, rounded auth-screen button. Distinct from app's square-edged
 * `Button` because Pencil auth/setup screens explicitly use cornerRadius
 * 10/12 with a soft lime shadow on the primary CTA.
 */
export const AuthButton = forwardRef<HTMLButtonElement, AuthButtonProps>(
  (
    {
      className,
      variant = 'primary',
      loading,
      icon,
      trailingIcon,
      children,
      disabled,
      style,
      ...props
    },
    ref,
  ) => {
    const isPrimary = variant === 'primary'
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        style={
          isPrimary
            ? { boxShadow: '0 6px 24px 0 rgba(191,255,0,0.25)', ...style }
            : style
        }
        className={cn(
          'group inline-flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-[12px]',
          'font-mono text-[12px] font-bold uppercase tracking-[2px] transition-colors',
          'disabled:cursor-not-allowed disabled:opacity-60',
          variant === 'primary' && 'bg-wm-accent text-wm-text-on-accent hover:bg-wm-accent-hover',
          variant === 'secondary' &&
            'rounded-[10px] border border-wm-border bg-wm-surface text-wm-text-secondary hover:bg-wm-surface-hover hover:text-wm-text-primary',
          variant === 'ghost' &&
            'text-wm-text-secondary hover:text-wm-text-primary',
          className,
        )}
        {...props}
      >
        {loading ? (
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : (
          icon
        )}
        <span>{children}</span>
        {!loading && trailingIcon}
      </button>
    )
  },
)
AuthButton.displayName = 'AuthButton'
