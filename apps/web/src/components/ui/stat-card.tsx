import { cn } from '@/lib/utils'

export interface StatCardProps {
  title: string
  value: string | number
  change?: string
  changeType?: 'positive' | 'negative' | 'neutral'
  className?: string
}

const changeColors = {
  positive: 'text-wm-accent',
  negative: 'text-wm-error',
  neutral: 'text-wm-text-muted',
}

export function StatCard({ title, value, change, changeType = 'positive', className }: StatCardProps) {
  return (
    // Pencil StatCard: padding [20, 24] = py-5 px-6, gap 8 vertical
    // label: 10px 600 letterSpacing 1 #404040
    // value: JetBrains Mono 28px 700 #FFFFFF
    // change: JetBrains Mono 12px 500 (color by type)
    <div className={cn('flex flex-col gap-2 border border-wm-border bg-wm-surface px-6 py-5', className)}>
      <p className="font-mono text-[10px] font-semibold tracking-[1px] uppercase text-wm-text-muted">
        {title}
      </p>
      <div className="flex items-center gap-2">
        <span className="font-mono text-[28px] font-bold leading-none text-wm-text-primary">
          {value}
        </span>
        {change && (
          <span className={cn('font-mono text-xs font-medium', changeColors[changeType])}>
            {change}
          </span>
        )}
      </div>
    </div>
  )
}
