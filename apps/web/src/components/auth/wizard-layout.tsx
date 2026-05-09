import { Check } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { BrandMark } from './auth-shell'

/**
 * SetupV3 wizard split layout.
 *
 * Pencil reference: `SetupV3-Domain` (`Jon4p`) and siblings.
 * Left `sideBar` width 662, bg #111, padding 60, justifyContent space_between:
 *   - Top: BrandMark + "SETUP WIZARD · STEP X OF N" eyebrow + headline + step cards
 *   - Footer: small reassurance line ("Self-hosted · open source · no telemetry")
 * Right `formPane`: padding [40, 80], justifyContent center, holds step content.
 */

export interface WizardStep {
  id: string
  label: string
  desc: string
  icon: LucideIcon
}

export interface WizardLayoutProps {
  steps: WizardStep[]
  currentStep: number
  /** Headline rendered between brandmark and step list. */
  headline?: React.ReactNode
  children: React.ReactNode
}

export function WizardLayout({ steps, currentStep, headline, children }: WizardLayoutProps) {
  return (
    <div className="flex min-h-screen bg-wm-bg">
      <aside className="relative hidden w-[45%] max-w-[662px] flex-col justify-between border-r border-wm-border bg-wm-surface p-[60px] lg:flex">
        <div className="flex flex-col gap-9">
          <BrandMark />
          <div className="flex flex-col gap-1.5">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[2px] text-wm-accent">
              Setup Wizard · Step {currentStep + 1} of {steps.length}
            </p>
            <h1 className="max-w-md font-mono text-[30px] font-bold leading-[1.2] text-wm-text-primary">
              {headline ?? <>Get your mail server<br />running in minutes.</>}
            </h1>
          </div>
          <ol className="flex flex-col gap-3 pt-3">
            {steps.map((s, i) => (
              <WizardStepCard key={s.id} step={s} index={i} state={stateOf(i, currentStep)} />
            ))}
          </ol>
        </div>
        <div className="flex items-center gap-2.5 font-mono text-[10px] font-semibold text-wm-text-tertiary">
          <span aria-hidden className="block h-1.5 w-1.5 rounded-full bg-wm-accent" />
          Self-hosted · Open source · No telemetry
        </div>
      </aside>
      <main className="flex flex-1 items-center justify-center px-6 py-10 lg:px-20 lg:py-10">
        <div className="w-full max-w-[480px]">{children}</div>
      </main>
    </div>
  )
}

type StepState = 'completed' | 'active' | 'pending'

function stateOf(idx: number, current: number): StepState {
  if (idx < current) return 'completed'
  if (idx === current) return 'active'
  return 'pending'
}

function WizardStepCard({
  step,
  index,
  state,
}: {
  step: WizardStep
  index: number
  state: StepState
}) {
  const Icon = step.icon
  const isActive = state === 'active'
  const isCompleted = state === 'completed'
  return (
    <li
      className={cn(
        'flex items-center gap-3.5 rounded-[14px] border px-4 py-3.5 transition-colors',
        isActive && 'border-wm-accent bg-wm-accent-dim',
        isCompleted && 'border-wm-border bg-transparent',
        !isActive && !isCompleted && 'border-wm-border bg-transparent',
      )}
      style={isActive ? { boxShadow: '0 6px 20px 0 rgba(191,255,0,0.12)' } : undefined}
    >
      <span
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]',
          isActive && 'bg-wm-accent text-wm-text-on-accent',
          isCompleted && 'bg-wm-accent text-wm-text-on-accent',
          !isActive && !isCompleted && 'border border-wm-border text-wm-text-tertiary',
        )}
        aria-hidden
      >
        {isCompleted ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
      </span>
      <span className="flex flex-1 flex-col gap-0.5">
        <span
          className={cn(
            'font-mono text-[12px] font-bold uppercase tracking-[1.5px]',
            isActive ? 'text-wm-accent' : isCompleted ? 'text-wm-text-primary' : 'text-wm-text-secondary',
          )}
        >
          {step.label}
        </span>
        <span className="font-mono text-[10px] text-wm-text-tertiary">{step.desc}</span>
      </span>
      <span className="font-mono text-[10px] text-wm-text-muted">{`0${index + 1}`.slice(-2)}</span>
    </li>
  )
}
