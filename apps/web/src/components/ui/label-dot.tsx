import { cn } from '@/lib/utils'

export interface LabelDotProps {
  color: string
  label?: string
  size?: 'sm' | 'md'
  className?: string
}

export function LabelDot({ color, label, size = 'sm', className }: LabelDotProps) {
  const dotSize = size === 'sm' ? 'h-1.5 w-1.5' : 'h-2 w-2'

  return (
    <div className={cn('inline-flex items-center gap-2', className)} title={label}>
      <span className={cn('rounded-full', dotSize)} style={{ backgroundColor: color }} />
      {label && <span className="font-mono text-xs text-wm-text-secondary">{label}</span>}
    </div>
  )
}
