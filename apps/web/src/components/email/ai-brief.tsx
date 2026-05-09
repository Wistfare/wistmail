'use client'

import { Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface AIBriefAction {
  id: string
  label: string
  icon?: React.ReactNode
  onClick: () => void
}

export interface AIBriefProps {
  /** Plain-text bullets / sentences. Each renders as a single line. */
  points: string[]
  /** Optional CTA buttons rendered below the bullets (Extract tasks etc). */
  actions?: AIBriefAction[]
  loading?: boolean
  className?: string
}

/**
 * The lime-bordered AI summary block at the top of a thread.
 *
 * Pencil reference: `InboxV3.aiBrief` (`Hyivo`) — bg #1A2200, 1px lime
 * border, cornerRadius 16, padding 18, gap 12.
 */
export function AIBrief({ points, actions, loading, className }: AIBriefProps) {
  return (
    <section
      className={cn(
        'flex flex-col gap-3 rounded-2xl border border-wm-accent bg-wm-accent-dim p-5',
        className,
      )}
      aria-label="AI brief"
    >
      <header className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[1.5px] text-wm-accent">
        <Sparkles className="h-3.5 w-3.5" />
        AI brief
      </header>

      {loading ? (
        <div className="flex flex-col gap-1.5">
          <span className="block h-3 w-3/4 animate-pulse bg-wm-accent/20" />
          <span className="block h-3 w-2/3 animate-pulse bg-wm-accent/20" />
          <span className="block h-3 w-1/2 animate-pulse bg-wm-accent/20" />
        </div>
      ) : points.length === 0 ? (
        <p className="font-mono text-[12px] text-wm-text-tertiary">
          No summary yet. Ask the model to generate one.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {points.map((p, i) => (
            <li
              key={i}
              className="flex gap-2.5 font-mono text-[12.5px] leading-[1.55] text-wm-text-primary"
            >
              <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 bg-wm-accent" />
              <span>{p}</span>
            </li>
          ))}
        </ul>
      )}

      {actions && actions.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {actions.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={a.onClick}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-wm-accent/40 bg-wm-accent/10 px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[1px] text-wm-accent transition-colors hover:bg-wm-accent/20"
            >
              {a.icon}
              {a.label}
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
