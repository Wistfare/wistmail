'use client'

import { Check, ChevronDown, FileText, Pencil } from 'lucide-react'
import { Menu } from '@/components/ui'
import { cn } from '@/lib/utils'
import type { DocStatus } from '@/lib/doc-queries'

export interface DocStatusPillProps {
  status: DocStatus
  onChange: (next: DocStatus) => void
  className?: string
  /** Read-only mode — render the chip but disable the menu. */
  readOnly?: boolean
}

const STATUS_LABEL: Record<DocStatus, string> = {
  draft: 'Draft',
  in_review: 'In review',
  published: 'Published',
}

const STATUS_TOKENS: Record<DocStatus, string> = {
  draft: 'bg-wm-surface-hover text-wm-text-secondary border-wm-border',
  in_review: 'bg-wm-warning/15 text-wm-warning border-wm-warning/40',
  published: 'bg-wm-accent-dim text-wm-accent border-wm-accent',
}

const STATUS_ICON: Record<DocStatus, React.ReactNode> = {
  draft: <Pencil className="h-3 w-3" />,
  in_review: <FileText className="h-3 w-3" />,
  published: <Check className="h-3 w-3" />,
}

/**
 * Editorial-state pill in the `DocsV3-Editor` header.
 * Pencil reference: `IMtz2` status chip (rendered as "IN REVIEW v0.1"
 * etc). Tap to open a menu with Draft / In review / Published.
 */
export function DocStatusPill({ status, onChange, readOnly, className }: DocStatusPillProps) {
  if (readOnly) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[1.5px]',
          STATUS_TOKENS[status],
          className,
        )}
      >
        {STATUS_ICON[status]}
        {STATUS_LABEL[status]}
      </span>
    )
  }
  return (
    <Menu align="end">
      <Menu.Trigger
        className={cn(
          'inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[1.5px] transition-opacity hover:opacity-90',
          STATUS_TOKENS[status],
          className,
        )}
      >
        {STATUS_ICON[status]}
        {STATUS_LABEL[status]}
        <ChevronDown className="h-3 w-3" />
      </Menu.Trigger>
      <Menu.Items>
        <Menu.Label>Status</Menu.Label>
        {(Object.keys(STATUS_LABEL) as DocStatus[]).map((s) => (
          <Menu.Item
            key={s}
            icon={STATUS_ICON[s]}
            onClick={() => onChange(s)}
          >
            {STATUS_LABEL[s]}
          </Menu.Item>
        ))}
      </Menu.Items>
    </Menu>
  )
}
