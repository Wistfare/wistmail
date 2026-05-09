'use client'

import { Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface AIBriefAction {
  id: string
  label: string
  icon?: React.ReactNode
  onClick: () => void
  /** First action defaults to the lime "primary" pill — set false to
   * force a secondary surface pill even on the first slot. */
  primary?: boolean
}

export interface AIBriefProps {
  /** Single-paragraph summary preferred for V3 (Pencil `aiBrief.M8Sj2R`).
   * If both `summary` and `points` are passed, `summary` wins. */
  summary?: string
  /** Plain-text bullets / sentences. Each renders as a single line.
   * Kept for backwards compat with the older list-based callsites. */
  points?: string[]
  /** Right-aligned amber meta on the header (Pencil "DUE FRI"). */
  meta?: string
  /** Header label — defaults to "AI BRIEF". Pencil shows e.g.
   * "AI BRIEF · 3 ACTION ITEMS". */
  headline?: string
  /** Optional CTA buttons rendered below the body. The first action
   * renders in the lime "primary" pill style (Pencil `act1`); the
   * remaining actions get the surface-with-border style (`act2`/`act3`). */
  actions?: AIBriefAction[]
  loading?: boolean
  className?: string
}

/**
 * The lime-bordered AI summary block at the top of a thread.
 *
 * Pencil reference: `InboxV3.aiBrief` (`Hyivo`)
 *   bg: #1A2200, border 1px lime, cornerRadius 16, padding 18, gap 12
 *   header (`j10wV`, justify space-between):
 *     left  → sparkles 14 lime + "AI BRIEF · 3 ACTION ITEMS" 10/700 lime tracking 1
 *     right → "DUE FRI" 10/700 amber #F59E0B tracking 1
 *   body (`M8Sj2R`): 13/500 white lineHeight 1.5
 *   actions (`DnX0M`, gap 8):
 *     act1 (primary) → lime fill, icon 13 black, label 11/700 black tracking 1, padding [10,16] radius 22
 *     act2/act3      → bg #111111, 1px #1A1A1A border, icon 13 white, label 11/700 white tracking 1
 */
export function AIBrief({
  summary,
  points,
  meta,
  headline = 'AI BRIEF',
  actions,
  loading,
  className,
}: AIBriefProps) {
  return (
    <section
      className={cn('flex flex-col bg-wm-accent-dim', className)}
      style={{
        gap: 12,
        padding: 18,
        borderRadius: 16,
        border: '1px solid var(--color-wm-accent)',
      }}
      aria-label="AI brief"
    >
      {/* aiHead — left "AI BRIEF · …" vs right amber meta. */}
      <header className="flex w-full items-center justify-between">
        <span
          className="inline-flex items-center font-mono font-bold uppercase text-wm-accent"
          style={{ gap: 8, fontSize: 10, letterSpacing: 1 }}
        >
          <Sparkles className="text-wm-accent" style={{ width: 14, height: 14 }} />
          {headline}
        </span>
        {meta && (
          <span
            className="font-mono font-bold uppercase"
            style={{
              fontSize: 10,
              letterSpacing: 1,
              color: '#F59E0B',
            }}
          >
            {meta}
          </span>
        )}
      </header>

      {loading ? (
        <div className="flex flex-col" style={{ gap: 6 }}>
          <span className="block h-3 w-3/4 animate-pulse bg-wm-accent/20" />
          <span className="block h-3 w-2/3 animate-pulse bg-wm-accent/20" />
          <span className="block h-3 w-1/2 animate-pulse bg-wm-accent/20" />
        </div>
      ) : summary ? (
        <p
          className="font-mono font-medium text-wm-text-primary"
          style={{ fontSize: 13, lineHeight: 1.5 }}
        >
          {summary}
        </p>
      ) : points && points.length > 0 ? (
        <ul className="flex flex-col" style={{ gap: 6 }}>
          {points.map((p, i) => (
            <li
              key={i}
              className="flex font-mono text-wm-text-primary"
              style={{ gap: 10, fontSize: 13, lineHeight: 1.5 }}
            >
              <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 bg-wm-accent" />
              <span>{p}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p
          className="font-mono"
          style={{ fontSize: 12, color: 'var(--color-wm-text-tertiary)' }}
        >
          No summary yet. Ask the model to generate one.
        </p>
      )}

      {actions && actions.length > 0 && (
        <div className="flex flex-wrap" style={{ gap: 8 }}>
          {actions.map((a, idx) => {
            // First action defaults to primary; later ones to surface.
            // Callers can override via `primary` on a per-action basis.
            const isPrimary = a.primary ?? idx === 0
            return (
              <button
                key={a.id}
                type="button"
                onClick={a.onClick}
                className={cn(
                  'inline-flex cursor-pointer items-center font-mono font-bold uppercase transition-colors',
                  isPrimary
                    ? 'bg-wm-accent text-wm-text-on-accent hover:bg-wm-accent-hover'
                    : 'bg-wm-surface text-wm-text-primary hover:bg-wm-surface-hover',
                )}
                style={{
                  gap: 8,
                  padding: '10px 16px',
                  borderRadius: 22,
                  fontSize: 11,
                  letterSpacing: 1,
                  border: isPrimary ? 'none' : '1px solid var(--color-wm-border)',
                }}
              >
                {a.icon}
                {a.label}
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}
