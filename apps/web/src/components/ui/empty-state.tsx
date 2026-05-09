import { cn } from '@/lib/utils'

export interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}

/**
 * Empty list / no-results state. Centered, monospace caption.
 * Pencil pattern: small icon (32px) tinted muted, title white, then
 * tertiary description, then optional action button.
 */
export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 px-6 py-16 text-center',
        className,
      )}
    >
      {icon && <div className="text-wm-text-muted">{icon}</div>}
      <h3 className="font-mono text-sm font-medium text-wm-text-primary">{title}</h3>
      {description && (
        <p className="max-w-sm font-mono text-xs text-wm-text-tertiary">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
