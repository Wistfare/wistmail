import { cn } from '@/lib/utils'

export interface BadgeProps {
  children: React.ReactNode
  variant?: 'default' | 'accent' | 'error' | 'warning' | 'info'
  size?: 'sm' | 'md'
  className?: string
}

const variantStyles = {
  default: 'bg-wm-surface-hover text-wm-text-secondary',
  accent: 'bg-wm-accent-dim text-wm-accent',
  error: 'bg-wm-error/15 text-wm-error',
  warning: 'bg-wm-warning/15 text-wm-warning',
  info: 'bg-wm-info/15 text-wm-info',
}

export function Badge({ children, variant = 'default', size = 'md', className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center font-mono font-semibold',
        size === 'sm' ? 'px-1.5 py-px text-[9px]' : 'px-2 py-0.5 text-[10px]',
        variantStyles[variant],
        className,
      )}
    >
      {children}
    </span>
  )
}
