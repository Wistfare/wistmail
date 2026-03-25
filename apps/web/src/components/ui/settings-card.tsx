import { cn } from '@/lib/utils'

export interface SettingsCardProps {
  title: string
  description?: string
  children: React.ReactNode
  className?: string
}

export function SettingsCard({ title, description, children, className }: SettingsCardProps) {
  return (
    <div className={cn('border border-wm-border bg-wm-surface p-6', className)}>
      <h3 className="text-base font-semibold text-wm-text-primary">{title}</h3>
      {description && (
        <p className="mt-1 font-mono text-xs text-wm-text-tertiary">{description}</p>
      )}
      <div className="mt-4">{children}</div>
    </div>
  )
}
