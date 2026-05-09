import { cn } from '@/lib/utils'

export interface SettingsCardProps {
  title: string
  description?: string
  children: React.ReactNode
  className?: string
}

export function SettingsCard({ title, description, children, className }: SettingsCardProps) {
  return (
    // Pencil SettingsCard: padding [20, 24] = py-5 px-6, gap 16 vertical.
    // title: Inter 16px 600 #FFF.
    // description: JetBrains Mono 12px #6E6E6E.
    <div className={cn('flex flex-col gap-4 border border-wm-border bg-wm-surface px-6 py-5', className)}>
      <div className="flex flex-col gap-1">
        <h3 className="text-base font-semibold text-wm-text-primary">{title}</h3>
        {description && (
          <p className="font-mono text-xs text-wm-text-tertiary">{description}</p>
        )}
      </div>
      <div>{children}</div>
    </div>
  )
}
