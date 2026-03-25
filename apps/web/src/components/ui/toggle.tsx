import { cn } from '@/lib/utils'

export interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  className?: string
}

export function Toggle({ checked, onChange, disabled, className }: ToggleProps) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        checked ? 'bg-wm-accent' : 'bg-wm-border',
        className,
      )}
    >
      <span
        className={cn(
          'inline-block h-4 w-4 rounded-full transition-transform',
          checked ? 'translate-x-4.5 bg-wm-text-on-accent' : 'translate-x-0.5 bg-wm-text-secondary',
        )}
      />
    </button>
  )
}
