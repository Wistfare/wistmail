import { cn } from '@/lib/utils'

export interface AuthCardProps {
  children: React.ReactNode
  className?: string
}

/**
 * Vertical stack used as the form container on auth screens.
 * Pencil reference: `card` frame inside formPane (width 420, gap 24).
 */
export function AuthCard({ children, className }: AuthCardProps) {
  return (
    <div className={cn('flex w-full max-w-[420px] flex-col gap-6', className)}>
      {children}
    </div>
  )
}

export interface AuthHeadingProps {
  eyebrow?: string
  title: string
  description?: string
}

export function AuthHeading({ eyebrow, title, description }: AuthHeadingProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {eyebrow && (
        <p className="font-mono text-[11px] font-bold uppercase tracking-[2px] text-wm-accent">
          {eyebrow}
        </p>
      )}
      <h1 className="font-mono text-[28px] font-bold leading-tight text-wm-text-primary">
        {title}
      </h1>
      {description && (
        <p className="font-mono text-[12px] font-medium text-wm-text-tertiary">
          {description}
        </p>
      )}
    </div>
  )
}

/** Centered hero icon used on MFA + Setup-Done — 80px lime ring with shadow. */
export function AuthHeroIcon({
  children,
  variant = 'ring',
}: {
  children: React.ReactNode
  variant?: 'ring' | 'solid'
}) {
  if (variant === 'solid') {
    // Setup-Done: 120×120 solid lime circle with check icon inside.
    return (
      <div
        className="flex h-[120px] w-[120px] items-center justify-center rounded-[30px] bg-wm-accent text-wm-text-on-accent"
        style={{ boxShadow: '0 8px 48px 0 rgba(191,255,0,0.4)' }}
      >
        {children}
      </div>
    )
  }
  return (
    <div
      className="flex h-20 w-20 items-center justify-center self-center rounded-[20px] border border-wm-accent bg-wm-accent-dim text-wm-accent"
      style={{ boxShadow: '0 8px 32px 0 rgba(191,255,0,0.25)' }}
    >
      {children}
    </div>
  )
}
