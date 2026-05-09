'use client'

import { cn } from '@/lib/utils'
import type { OutlineNode } from '@/lib/doc-outline'

export interface DocOutlineProps {
  outline: OutlineNode[]
  /** Active heading id (typically derived from scroll position). */
  activeId?: string
  onPick?: (id: string) => void
  className?: string
}

/**
 * Left rail outline tree.
 *
 * Pencil reference: `DocsV3-Editor` (`IMtz2`) — a vertical list of the
 * doc's headings, indented by level, with a lime active state for the
 * current section.
 */
export function DocOutline({ outline, activeId, onPick, className }: DocOutlineProps) {
  return (
    <aside
      className={cn(
        'flex w-60 shrink-0 flex-col gap-1 overflow-y-auto border-r border-wm-border bg-wm-bg p-5',
        className,
      )}
    >
      <header className="pb-2">
        <span className="font-mono text-[10px] font-bold uppercase tracking-[1.5px] text-wm-text-tertiary">
          Outline
        </span>
      </header>
      {outline.length === 0 ? (
        <p className="font-mono text-[11px] text-wm-text-muted">
          Add a heading (e.g. <code>## Goals</code>) to populate the outline.
        </p>
      ) : (
        outline.map((n) => (
          <button
            key={n.id}
            type="button"
            onClick={() => onPick?.(n.id)}
            aria-current={activeId === n.id ? 'true' : undefined}
            className={cn(
              'flex w-full cursor-pointer items-center rounded-md px-2 py-1 text-left font-mono text-[12px] transition-colors',
              n.level === 1 && 'pl-2',
              n.level === 2 && 'pl-4',
              n.level === 3 && 'pl-6',
              activeId === n.id
                ? 'bg-wm-accent-dim text-wm-accent'
                : 'text-wm-text-secondary hover:bg-wm-surface-hover hover:text-wm-text-primary',
            )}
          >
            <span className="truncate">{n.text}</span>
          </button>
        ))
      )}
    </aside>
  )
}
