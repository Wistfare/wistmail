import { cn } from '@/lib/utils'

export interface FieldStackProps {
  label: string
  htmlFor?: string
  hint?: string
  error?: string
  required?: boolean
  /** Optional adornment on the right of the label row (e.g. "FORGOT PASSWORD?"). */
  adornment?: React.ReactNode
  children: React.ReactNode
  className?: string
}

/**
 * Stacked label-above-field layout used on auth/setup screens.
 * Pencil reference: LoginV3 "EMAIL" / "PASSWORD" labels above their input
 * fields, JetBrains Mono 11px uppercase tracked.
 */
export function FieldStack({
  label,
  htmlFor,
  hint,
  error,
  required,
  adornment,
  children,
  className,
}: FieldStackProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <label
          htmlFor={htmlFor}
          className="font-mono text-[11px] font-medium uppercase tracking-wider text-wm-text-secondary"
        >
          {label}
          {required && <span aria-hidden className="ml-0.5 text-wm-accent">*</span>}
        </label>
        {adornment && <div>{adornment}</div>}
      </div>
      {children}
      {error && <p className="font-mono text-[11px] text-wm-error">{error}</p>}
      {hint && !error && <p className="font-mono text-[11px] text-wm-text-tertiary">{hint}</p>}
    </div>
  )
}
