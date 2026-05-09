import { cn } from '@/lib/utils'

export interface PageHeaderProps {
  /** Section label rendered above the title — e.g. "INBOX > UNREAD" or breadcrumbs. */
  eyebrow?: React.ReactNode
  title: React.ReactNode
  /** Optional subtitle (e.g. count, filter description). */
  subtitle?: React.ReactNode
  /** Right-aligned action buttons / search / view-toggle. */
  actions?: React.ReactNode
  /** Below the header bar (e.g. tabs / filter chips). */
  toolbar?: React.ReactNode
  className?: string
}

/**
 * Top of every primary page (Inbox, Calendar, Work, Settings, Admin, etc.).
 *
 * Pencil reference: every V3 screen has a top bar with section title on
 * the left and 1-3 actions on the right. We keep it as a stand-alone
 * primitive so each module owns its actions but the chrome stays uniform.
 */
export function PageHeader({ eyebrow, title, subtitle, actions, toolbar, className }: PageHeaderProps) {
  return (
    <header className={cn('border-b border-wm-border bg-wm-bg', className)}>
      <div className="flex items-center justify-between gap-4 px-6 py-4">
        <div className="flex min-w-0 flex-col gap-1">
          {eyebrow && (
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[2px] text-wm-text-muted">
              {eyebrow}
            </p>
          )}
          <div className="flex items-baseline gap-3">
            <h1 className="truncate font-sans text-2xl font-semibold text-wm-text-primary">
              {title}
            </h1>
            {subtitle && (
              <span className="font-mono text-xs text-wm-text-tertiary">{subtitle}</span>
            )}
          </div>
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {toolbar && <div className="border-t border-wm-border px-6 py-2">{toolbar}</div>}
    </header>
  )
}
