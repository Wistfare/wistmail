'use client'

import { cn } from '@/lib/utils'

export interface FilterPill<T extends string> {
  id: T
  label: string
  count?: number
}

export interface FilterPillsProps<T extends string> {
  value: T
  options: FilterPill<T>[]
  onChange: (id: T) => void
  className?: string
  /** Optional element rendered to the right (e.g. search icon button). */
  trailing?: React.ReactNode
}

/**
 * Pill-style segmented control. Pencil reference: `InboxV3.segWrap`
 * (`Wi0OX/Rc1yj/C9UYRb`) — cornerRadius 18, padding [8, 14], gap 6.
 * Active pill = lime fill with black text; inactive = surface fill with
 * tertiary text.
 */
export function FilterPills<T extends string>({
  value,
  options,
  onChange,
  className,
  trailing,
}: FilterPillsProps<T>) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="flex items-center gap-1.5">
        {options.map((opt) => {
          const active = opt.id === value
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onChange(opt.id)}
              aria-pressed={active}
              className={cn(
                'inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3.5 py-1.5 font-mono text-[11px] font-semibold transition-colors',
                active
                  ? 'bg-wm-accent text-wm-text-on-accent'
                  : 'border border-wm-border bg-wm-surface text-wm-text-secondary hover:bg-wm-surface-hover hover:text-wm-text-primary',
              )}
            >
              {opt.label}
              {typeof opt.count === 'number' && opt.count > 0 && (
                <span
                  className={cn(
                    'inline-flex min-w-[18px] justify-center rounded-full px-1 font-mono text-[10px] font-bold',
                    active
                      ? 'bg-wm-text-on-accent/15 text-wm-text-on-accent'
                      : 'text-wm-text-muted',
                  )}
                >
                  {opt.count}
                </span>
              )}
            </button>
          )
        })}
      </div>
      {trailing && <div className="ml-auto">{trailing}</div>}
    </div>
  )
}
