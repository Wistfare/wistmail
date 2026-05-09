'use client'

import { Calendar, CheckCircle2, Circle } from 'lucide-react'
import { cn, formatRelativeTime } from '@/lib/utils'
import type { ProjectTask, TaskStatus } from '@/lib/work-queries'

export interface TaskRowProps {
  task: ProjectTask
  projectName?: string
  projectColor?: string
  /** Highlighted as next-up — Pencil "Up next" lime row treatment. */
  highlighted?: boolean
  onClick?: () => void
  onToggleDone?: () => void
}

/**
 * Single-row task list item used on the WorkV3 "My day" page.
 *
 * Pencil reference: `WorkV3` rows — left checkbox, project chip + title,
 * right side time hint. The first row in "Up next" gets a lime
 * highlighted treatment.
 */
export function TaskRow({
  task,
  projectName,
  projectColor = '#BFFF00',
  highlighted,
  onClick,
  onToggleDone,
}: TaskRowProps) {
  const done = task.status === 'done'
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick?.()
        }
      }}
      className={cn(
        'group flex cursor-pointer items-center gap-3 border-b border-wm-border px-5 py-3 transition-colors',
        highlighted
          ? 'border-l-[3px] border-l-wm-accent bg-wm-accent-dim'
          : 'border-l-[3px] border-l-transparent hover:bg-wm-surface-hover',
      )}
    >
      <button
        type="button"
        aria-label={done ? 'Mark not done' : 'Mark done'}
        aria-pressed={done}
        onClick={(e) => {
          e.stopPropagation()
          onToggleDone?.()
        }}
        className="flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center text-wm-text-muted transition-colors hover:text-wm-accent"
      >
        {done ? (
          <CheckCircle2 className="h-5 w-5 text-wm-accent" />
        ) : (
          <Circle className="h-5 w-5" />
        )}
      </button>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {projectName && (
          <span
            className="inline-flex max-w-fit items-center gap-1.5 px-1.5 py-px font-mono text-[9px] font-bold uppercase tracking-[1.5px]"
            style={{ backgroundColor: `${projectColor}26`, color: projectColor }}
          >
            <span aria-hidden className="h-1 w-1" style={{ backgroundColor: projectColor }} />
            {projectName}
          </span>
        )}
        <span
          className={cn(
            'truncate font-sans text-[13px] font-medium',
            done
              ? 'text-wm-text-tertiary line-through'
              : 'text-wm-text-primary',
          )}
        >
          {task.title}
        </span>
      </div>

      {task.dueDate && (
        <span className="flex shrink-0 items-center gap-1 font-mono text-[11px] text-wm-text-tertiary">
          <Calendar className="h-3 w-3" />
          {formatRelativeTime(new Date(task.dueDate))}
        </span>
      )}
    </div>
  )
}

export function statusLabel(s: TaskStatus): string {
  return s === 'todo' ? 'Todo' : s === 'in_progress' ? 'In progress' : 'Done'
}
