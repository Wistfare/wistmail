'use client'

import Link from 'next/link'
import { Avatar } from '@/components/ui'
import { cn, formatRelativeTime } from '@/lib/utils'

export interface DocCardProps {
  href: string
  title: string
  /** Emoji or single-character icon shown in the colored corner tile. */
  icon?: string | null
  /** First N words of the doc body, rendered as muted preview. */
  preview?: string | null
  /** ISO timestamp shown in the card footer. */
  updatedAt: string
  /** Optional avatars of recent contributors, rendered as a stack. */
  contributors?: Array<{ id: string; name: string; avatarUrl?: string | null }>
  /** Highlight as "active" / pinned card. */
  highlighted?: boolean
  /** Color for the icon tile bg + active border. */
  color?: string
  className?: string
}

/**
 * V3 doc card. Pencil reference: `DocsV3` (`sOpka`).
 *
 * Card structure:
 *   [icon-tile]                                [color-stripe]
 *   Title
 *   Preview (2 lines)
 *   ─────────────────────────
 *   [avatars]              relative time
 */
export function DocCard({
  href,
  title,
  icon,
  preview,
  updatedAt,
  contributors = [],
  highlighted,
  color = '#BFFF00',
  className,
}: DocCardProps) {
  return (
    <Link
      href={href}
      className={cn(
        'group relative flex min-h-[180px] flex-col gap-3 rounded-xl border bg-wm-surface p-4 transition-colors hover:border-wm-text-tertiary',
        highlighted ? 'border-wm-accent bg-wm-accent-dim' : 'border-wm-border',
        className,
      )}
      style={highlighted ? { boxShadow: '0 6px 24px 0 rgba(191,255,0,0.18)' } : undefined}
    >
      <header className="flex items-start justify-between gap-2">
        <span
          aria-hidden
          className="flex h-9 w-9 items-center justify-center rounded-md font-sans text-base"
          style={{
            backgroundColor: `${color}26`,
            color,
          }}
        >
          {icon ?? title.trim()[0]?.toUpperCase() ?? '·'}
        </span>
        <span
          aria-hidden
          className="h-1.5 w-6 rounded-full"
          style={{ backgroundColor: highlighted ? color : 'transparent' }}
        />
      </header>

      <div className="flex flex-1 flex-col gap-1.5">
        <h3
          className={cn(
            'truncate font-sans text-[15px] font-semibold',
            highlighted ? 'text-wm-text-primary' : 'text-wm-text-primary',
          )}
        >
          {title}
        </h3>
        {preview && (
          <p className="line-clamp-2 font-mono text-[11px] leading-[1.5] text-wm-text-tertiary">
            {preview}
          </p>
        )}
      </div>

      <footer className="flex items-center justify-between gap-2 border-t border-wm-border pt-3">
        <div className="flex -space-x-2">
          {contributors.slice(0, 4).map((c) => (
            <span
              key={c.id}
              className="rounded-full ring-2 ring-wm-surface"
              title={c.name}
            >
              <Avatar name={c.name} src={c.avatarUrl ?? undefined} size="sm" />
            </span>
          ))}
          {contributors.length > 4 && (
            <span className="ml-2 font-mono text-[10px] text-wm-text-tertiary">
              +{contributors.length - 4}
            </span>
          )}
        </div>
        <span className="font-mono text-[10px] text-wm-text-tertiary">
          {formatRelativeTime(new Date(updatedAt))}
        </span>
      </footer>
    </Link>
  )
}

/** Empty "+ New doc" placeholder rendered as a card-shaped button. */
export function DocCardEmpty({
  onClick,
  className,
}: {
  onClick: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex min-h-[180px] cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-wm-border bg-wm-bg font-mono text-[12px] font-medium text-wm-text-tertiary transition-colors hover:border-wm-accent hover:text-wm-accent',
        className,
      )}
    >
      + New doc
    </button>
  )
}
