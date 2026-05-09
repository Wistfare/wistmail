import { ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * AuthShell — the V3 split-screen used by login, MFA challenge, forgot
 * password, reset password.
 *
 * Pencil reference: `LoginV3` (`Ar0aI`) and `MFAChallengeV3` (`XTWjb`).
 *
 * Layout (above lg breakpoint):
 *   ┌─────────────── 1460 ───────────────┐
 *   │  decorPane 662  │ formPane fill     │
 *   │  bg #111        │ bg #000           │
 *   │  padding 60     │ padding [40, 80]  │
 *   │  vert · between │ centered          │
 *   └────────────────────────────────────┘
 *
 * Below lg the decor pane collapses; the form fills the screen.
 */

export interface AuthShellProps {
  decor?: React.ReactNode
  /** Optional below-marketing footer line (e.g. "Self-hosted · open source"). */
  footer?: React.ReactNode
  children: React.ReactNode
  className?: string
}

export function AuthShell({ decor, footer, children, className }: AuthShellProps) {
  return (
    <div className={cn('flex min-h-screen bg-wm-bg', className)}>
      <aside className="relative hidden w-[45%] max-w-[662px] flex-col justify-between border-r border-wm-border bg-wm-surface p-[60px] lg:flex">
        {decor ?? <DefaultDecor />}
        {footer && (
          <div className="flex items-center gap-2.5 font-mono text-[10px] font-semibold text-wm-text-tertiary">
            <ShieldCheck className="h-3.5 w-3.5 text-wm-accent" />
            {footer}
          </div>
        )}
      </aside>
      <main className="flex flex-1 items-center justify-center px-6 py-10 lg:px-20 lg:py-10">
        {children}
      </main>
    </div>
  )
}

/**
 * Default left-pane decoration: logo at top + marketing tagline at bottom.
 * Pencil's `decorPane` for LoginV3.
 */
export function DefaultDecor() {
  return (
    <>
      <BrandMark />
      <Tagline />
    </>
  )
}

export function BrandMark({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-3.5', className)}>
      <div className="flex h-12 w-12 items-center justify-center rounded-[14px] bg-wm-accent">
        <span className="font-sans text-xl font-bold text-wm-text-on-accent">W</span>
      </div>
      <span className="font-mono text-sm font-bold uppercase tracking-[3px] text-wm-text-primary">
        Wistfare Mail
      </span>
    </div>
  )
}

export function Tagline() {
  return (
    <div className="flex max-w-md flex-col gap-4">
      <h2 className="font-mono text-[38px] font-bold leading-[1.1] tracking-[1px]">
        <span className="block text-wm-text-primary">YOUR INBOX,</span>
        <span className="block text-wm-accent">BUILT FOR FOCUS.</span>
      </h2>
      <p className="font-mono text-[13px] font-medium leading-[1.6] text-wm-text-secondary">
        Mail · Chat · Calendar · Projects.
        <br />
        One workspace, end-to-end encrypted, AI-aware.
      </p>
    </div>
  )
}
