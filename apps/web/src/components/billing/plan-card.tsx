'use client'

import { Check } from 'lucide-react'
import { cn, formatCents } from '@/lib/utils'

export interface PlanCardFeature {
  key: string
  label?: string | null
  /** Raw value from the catalog (boolean / number / null / object). Optional so
   * synthetic placeholder cards can render without fabricating one. */
  value?: unknown
}

export interface PlanCardProps {
  code: string
  name: string
  description?: string | null
  perSeatCents: number
  currency?: string
  features?: PlanCardFeature[]
  /** Highlight this card as the user's current plan. */
  current?: boolean
  /** Highlight this card as the recommended pick (lime border + chip). */
  recommended?: boolean
  /** CTA copy — e.g. "Choose plan", "Current plan", "Contact sales". */
  ctaLabel: string
  /** Disabled CTA — used for "Current plan". */
  ctaDisabled?: boolean
  onCtaClick?: () => void
  className?: string
}

/**
 * Pencil reference: plan-picker card inside `AdminV3-Plan` (`iz5TA`).
 *
 * Each card is a black surface with a thin border, big price, feature list
 * with lime check icons, and a CTA at the bottom. The "Team" plan is
 * highlighted with a lime border + glow + RECOMMENDED chip.
 */
export function PlanCard({
  code,
  name,
  description,
  perSeatCents,
  currency = 'USD',
  features = [],
  current,
  recommended,
  ctaLabel,
  ctaDisabled,
  onCtaClick,
  className,
}: PlanCardProps) {
  return (
    <div
      className={cn(
        'flex flex-col border bg-wm-surface px-6 py-6 transition-colors',
        recommended
          ? 'border-wm-accent shadow-[0_0_24px_0_rgba(191,255,0,0.2)]'
          : 'border-wm-border',
        className,
      )}
      data-plan-code={code}
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] font-bold uppercase tracking-[1.5px] text-wm-text-tertiary">
          {name}
        </span>
        {recommended && (
          <span className="bg-wm-accent px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[1.5px] text-wm-text-on-accent">
            Recommended
          </span>
        )}
        {current && !recommended && (
          <span className="border border-wm-border px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[1.5px] text-wm-text-secondary">
            Current
          </span>
        )}
      </div>

      <div className="mt-3 flex items-baseline gap-1.5">
        <span className="font-mono text-[36px] font-bold leading-none text-wm-text-primary">
          {perSeatCents > 0 ? formatCents(perSeatCents, currency) : 'Free'}
        </span>
        {perSeatCents > 0 && (
          <span className="font-mono text-[11px] text-wm-text-tertiary">
            / user / mo
          </span>
        )}
      </div>

      {description && (
        <p className="mt-2 font-mono text-[11px] text-wm-text-tertiary">
          {description}
        </p>
      )}

      {features.length > 0 && (
        <ul className="mt-5 flex flex-col gap-2.5">
          {features.map((f) => (
            <li
              key={f.key}
              className="flex items-start gap-2 font-mono text-[12px] text-wm-text-secondary"
            >
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-wm-accent" />
              <span>{f.label ?? f.key}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-6">
        <button
          type="button"
          onClick={onCtaClick}
          disabled={ctaDisabled}
          className={cn(
            'flex w-full items-center justify-center px-4 py-2.5 font-mono text-[11px] font-bold uppercase tracking-[1.5px] transition-colors',
            recommended
              ? 'bg-wm-accent text-wm-text-on-accent hover:bg-wm-accent-hover'
              : 'border border-wm-border text-wm-text-secondary hover:border-wm-accent hover:text-wm-accent',
            ctaDisabled && 'cursor-not-allowed opacity-60',
          )}
        >
          {ctaLabel}
        </button>
      </div>
    </div>
  )
}
