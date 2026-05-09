import { cn } from '@/lib/utils'

export interface InboxSectionHeaderProps {
  label: string
  count?: number
  /** Optional right-side adornment (e.g. "Mark all read" link). */
  trailing?: React.ReactNode
  className?: string
}

/**
 * "TODAY · 4" group divider rendered between bands of email rows.
 * Pencil reference: `InboxV3.sec1` / `sec2` — JetBrains Mono 10px 600
 * letterSpacing 1, color #999, padding [10, 20, 8, 20].
 */
export function InboxSectionHeader({
  label,
  count,
  trailing,
  className,
}: InboxSectionHeaderProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-between bg-wm-bg px-5 pb-2 pt-3',
        className,
      )}
    >
      <span className="font-mono text-[10px] font-semibold uppercase tracking-[1px] text-wm-text-secondary">
        {label}
        {typeof count === 'number' && (
          <span className="ml-1.5 text-wm-text-muted">· {count}</span>
        )}
      </span>
      {trailing}
    </div>
  )
}
