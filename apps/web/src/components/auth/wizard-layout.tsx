'use client'

import Image from 'next/image'
import { Check, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * SetupV3 wizard split layout.
 *
 * Pencil reference: `Screen/SetupV3-Domain` (`Jon4p`) and siblings.
 *   sideBar 662   │  formPane fill
 *   bg #111       │  bg #000
 *   padding 60    │  padding [40, 80]
 *   vert · between│  centered
 *
 * sideBar inner structure (gap 36 vertical):
 *   sbL    (gap 14 horizontal)
 *     50×48 logo (image fill, radius 14)  +  "WISTFARE MAIL" 14/700 white tracking 3
 *   sbHd   (gap 6 vertical)
 *     "SETUP WIZARD · STEP X OF 4"  10/700 lime tracking 2
 *     "Get your mail server\nrunning in minutes."  30/700 white line-height 1.2 fixed-width
 *   steps  (gap 12 vertical, padding [12, 0, 0, 0])
 *     4 × WizardStepCard
 */

export type WizardStepState = 'completed' | 'active' | 'pending'

export interface WizardStep {
  id: string
  label: string
  /**
   * Status caption shown under the label, e.g.:
   *   pending   → "VERIFY YOUR DOMAIN" / "CONFIGURE DNS RECORDS" / …
   *   active    → same caption
   *   completed → "COMPLETED · WISTMAIL.COM" / "COMPLETED · 4 RECORDS" / …
   * The page passes the caption it wants to display; this component
   * just renders it.
   */
  caption: string
  /** Lucide icon used for pending + active states. Completed always shows a check. */
  icon: LucideIcon
}

export interface WizardLayoutProps {
  steps: WizardStep[]
  currentStep: number
  /** Headline rendered between brandmark and the step list. Defaults to
   * Pencil's "Get your mail server / running in minutes." */
  headline?: React.ReactNode
  children: React.ReactNode
}

export function WizardLayout({
  steps,
  currentStep,
  headline,
  children,
}: WizardLayoutProps) {
  return (
    <div className="flex min-h-screen bg-wm-bg">
      <aside
        className={cn(
          'relative hidden flex-col justify-between border-r border-wm-border bg-wm-surface lg:flex',
          'w-[45%] max-w-[662px]',
        )}
        // Pencil sideBar padding: 60.
        style={{ padding: 60 }}
      >
        <div className="flex flex-col" style={{ gap: 36 }}>
          {/* sbL — logo + wordmark */}
          <div className="flex items-center" style={{ gap: 14 }}>
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
              className="font-mono font-bold text-wm-text-primary"
              style={{ fontSize: 14, letterSpacing: 3 }}
            >
              WISTFARE MAIL
            </span>
          </div>

          {/* sbHd — eyebrow + headline */}
          <div className="flex w-full flex-col" style={{ gap: 6 }}>
            <p
              className="font-mono font-bold uppercase text-wm-accent"
              style={{ fontSize: 10, letterSpacing: 2 }}
            >
              Setup wizard · step {currentStep + 1} of {steps.length}
            </p>
            <h1
              className="font-mono font-bold leading-[1.2] text-wm-text-primary"
              style={{ fontSize: 30 }}
            >
              {headline ?? (
                <>
                  Get your mail server
                  <br />
                  running in minutes.
                </>
              )}
            </h1>
          </div>

          {/* steps — 4 cards, gap 12, padding-top 12 */}
          <ol
            className="flex w-full flex-col"
            style={{ gap: 12, paddingTop: 12 }}
          >
            {steps.map((s, i) => (
              <WizardStepCard
                key={s.id}
                step={s}
                state={
                  i < currentStep
                    ? 'completed'
                    : i === currentStep
                      ? 'active'
                      : 'pending'
                }
              />
            ))}
          </ol>
        </div>
      </aside>
      <main className="flex flex-1 items-center justify-center px-6 py-10 lg:px-[80px] lg:py-10">
        {children}
      </main>
    </div>
  )
}

function WizardStepCard({
  step,
  state,
}: {
  step: WizardStep
  state: WizardStepState
}) {
  const Icon = step.icon
  const isActive = state === 'active'
  const isCompleted = state === 'completed'

  // Tile + label colours come straight from Pencil:
  //   icon tile — active/completed: lime fill, black icon (radius 10, 40×40)
  //                pending: bg #000, 1px #1A1A1A border, #6E6E6E icon
  //   label    — active/completed: 14/700 lime
  //               pending: 14/600 #6E6E6E
  //   caption  — active: #999999, completed: lime, pending: #404040 (9/700 tracking 1.5)
  const cardStyle: React.CSSProperties = isActive
    ? {
        backgroundColor: 'var(--color-wm-accent-dim)',
        border: '1px solid var(--color-wm-accent)',
      }
    : { border: '1px solid var(--color-wm-border)' }

  const tileStyle: React.CSSProperties =
    isActive || isCompleted
      ? { backgroundColor: 'var(--color-wm-accent)' }
      : {
          backgroundColor: 'var(--color-wm-bg)',
          border: '1px solid var(--color-wm-border)',
        }

  const captionColor = isActive ? '#999999' : isCompleted ? '#BFFF00' : '#404040'
  const labelColor = isActive || isCompleted ? '#BFFF00' : '#6e6e6e'
  const labelWeight = isActive || isCompleted ? 700 : 600

  return (
    <li
      className="flex items-center"
      style={{
        gap: 14,
        padding: '14px 16px',
        borderRadius: 14,
        ...cardStyle,
      }}
    >
      <span
        aria-hidden
        className="flex shrink-0 items-center justify-center"
        style={{ width: 40, height: 40, borderRadius: 10, ...tileStyle }}
      >
        {isCompleted ? (
          <Check
            style={{
              width: 18,
              height: 18,
              color: '#000000',
            }}
          />
        ) : (
          <Icon
            style={{
              width: 18,
              height: 18,
              color: isActive ? '#000000' : '#6e6e6e',
            }}
          />
        )}
      </span>
      <span className="flex flex-1 flex-col" style={{ gap: 2 }}>
        <span
          className="font-mono"
          style={{ fontSize: 14, fontWeight: labelWeight, color: labelColor }}
        >
          {step.label}
        </span>
        <span
          className="font-mono font-bold uppercase"
          style={{ fontSize: 9, letterSpacing: 1.5, color: captionColor }}
        >
          {step.caption}
        </span>
      </span>
    </li>
  )
}
