'use client'

import { Star } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface EmailItemProps {
  id: string
  from: string
  subject: string
  preview: string
  timestamp: string
  isRead: boolean
  isStarred: boolean
  labels?: Array<{ name: string; color: string }>
  selected?: boolean
  onClick?: () => void
  onStar?: () => void
}

export function EmailItem({
  from,
  subject,
  preview,
  timestamp,
  isRead,
  isStarred,
  labels = [],
  selected,
  onClick,
  onStar,
}: EmailItemProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'flex cursor-pointer flex-col gap-1.5 border-b border-wm-border px-5 py-3.5',
        'transition-colors hover:bg-wm-surface-hover',
        selected && 'border-l-2 border-l-wm-accent bg-wm-surface',
        !isRead && !selected && 'bg-wm-surface/50',
      )}
    >
      {/* Top row: sender, star, time */}
      <div className="flex items-center gap-2">
        {!isRead && <span className="h-1.5 w-1.5 rounded-full bg-wm-accent" />}
        <span
          className={cn(
            'text-[13px]',
            isRead ? 'text-wm-text-secondary' : 'font-semibold text-wm-text-primary',
          )}
        >
          {from}
        </span>
        <span className="flex-1" />
        <button
          onClick={(e) => {
            e.stopPropagation()
            onStar?.()
          }}
          className="text-wm-text-muted hover:text-wm-warning"
        >
          <Star className={cn('h-3.5 w-3.5', isStarred && 'fill-wm-warning text-wm-warning')} />
        </button>
        <span className="font-mono text-[10px] text-wm-text-muted">{timestamp}</span>
      </div>

      {/* Subject */}
      <p
        className={cn(
          'truncate text-[13px]',
          isRead ? 'text-wm-text-secondary' : 'font-medium text-wm-text-primary',
        )}
      >
        {subject}
      </p>

      {/* Preview */}
      <p className="truncate font-mono text-[11px] leading-relaxed text-wm-text-tertiary">{preview}</p>

      {/* Labels */}
      {labels.length > 0 && (
        <div className="flex items-center gap-1.5 pt-0.5">
          {labels.map((label) => (
            <span
              key={label.name}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 font-mono text-[9px] font-semibold"
              style={{
                backgroundColor: `${label.color}20`,
                color: label.color,
              }}
            >
              <span
                className="h-1 w-1 rounded-full"
                style={{ backgroundColor: label.color }}
              />
              {label.name}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
