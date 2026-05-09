import Image from 'next/image'
import { cn } from '@/lib/utils'

/**
 * AuthShell — V3 split-screen used by login, MFA challenge, forgot
 * password, reset password.
 *
 * Pencil reference: `Screen/LoginV3` (`Ar0aI`):
 *   ┌──── 1460 ────────────────────────────────────────────┐
 *   │ decorPane 662 │ formPane fill                         │
 *   │ bg #111       │ bg #000                               │
 *   │ padding 60    │ padding [40, 80]                      │
 *   │ vert · between│ centered                              │
 *   └──────────────────────────────────────────────────────┘
 *
 * Below the lg breakpoint the decor pane is hidden; the form fills the
 * whole screen.
 */

export interface AuthShellProps {
  decor?: React.ReactNode
  /** Optional bottom-row footer in the decor pane. Pencil's LoginV3 has
   * no footer — leave undefined unless a sibling frame (e.g. setup) does. */
  footer?: React.ReactNode
  children: React.ReactNode
  className?: string
}

export function AuthShell({ decor, footer, children, className }: AuthShellProps) {
  return (
    <div className={cn('flex min-h-screen bg-wm-bg', className)}>
      <aside
        className={cn(
          'relative hidden flex-col justify-between border-r border-wm-border bg-wm-surface lg:flex',
          'w-[45%] max-w-[662px]',
        )}
        // Pencil decorPane padding: 60 — render the literal value so the
        // header + tagline line up against the design.
        style={{ padding: 60 }}
      >
        {decor ?? <DefaultDecor />}
        {footer && <div className="font-mono text-[10px] text-wm-text-tertiary">{footer}</div>}
      </aside>
      {/* Pencil formPane: padding [40, 80] (lg+) — collapses to 24/40 on
          smaller screens. Form children are rendered once; the form
          itself constrains its own width via `max-w-[420px]`. */}
      <main className="flex flex-1 items-center justify-center px-6 py-10 lg:px-[80px] lg:py-10">
        {children}
      </main>
    </div>
  )
}

/**
 * Default left-pane decoration: brand mark at top, marketing tagline at
 * bottom. Pencil's `decorPane.ldecH` + `decorPane.ldecQ`.
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
  // Pencil ldecLogo: alignItems center, gap 14 horizontal.
  // ldecLogoMark: 50×48, cornerRadius 14, image fill (mode=fit) of
  // `wistfare_mail_logo.png`. The wordmark is JetBrains Mono 14px 700
  // #FFFFFF letterSpacing 3.
  return (
    <div className={cn('flex items-center gap-[14px]', className)}>
      <div
        className="relative shrink-0 overflow-hidden rounded-[14px]"
        style={{ width: 50, height: 48 }}
      >
        <Image
          src="/wistfare_mail_logo.png"
          alt="Wistfare Mail logo"
          fill
          sizes="50px"
          className="object-contain"
          priority
        />
      </div>
      <span
        className="font-mono text-[14px] font-bold text-wm-text-primary"
        style={{ letterSpacing: 3 }}
      >
        WISTFARE MAIL
      </span>
    </div>
  )
}

export function Tagline() {
  // Pencil ldecQ: gap 18 vertical, width fill_container.
  // - "YOUR INBOX," — JetBrains Mono 38px 700 #FFFFFF letterSpacing 1 lineHeight 1.1
  // - "BUILT FOR FOCUS." — same but #BFFF00
  // - subtitle — JetBrains Mono 13px 500 #999999 lineHeight 1.6
  return (
    <div className="flex w-full flex-col" style={{ gap: 18 }}>
      <h2
        className="font-mono font-bold"
        style={{ fontSize: 38, lineHeight: 1.1, letterSpacing: 1 }}
      >
        <span className="block text-wm-text-primary">YOUR INBOX,</span>
        <span className="block text-wm-accent">BUILT FOR FOCUS.</span>
      </h2>
      <p
        className="font-mono font-medium text-wm-text-secondary"
        style={{ fontSize: 13, lineHeight: 1.6 }}
      >
        Mail · Chat · Calendar · Projects.
        <br />
        One workspace, end-to-end encrypted, AI-aware.
      </p>
    </div>
  )
}
