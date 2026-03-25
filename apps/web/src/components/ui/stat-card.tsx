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
    <div className={cn('border border-wm-border bg-wm-surface p-5', className)}>
      <p className="font-mono text-[10px] font-semibold tracking-wider text-wm-text-muted">{title}</p>
      <div className="mt-2 flex items-center gap-2">
        <span className="font-mono text-2xl font-bold text-wm-text-primary">{value}</span>
        {change && (
          <span className={cn('font-mono text-xs font-medium', changeColors[changeType])}>
            {change}
          </span>
        )}
      </div>
    </div>
  )
}
