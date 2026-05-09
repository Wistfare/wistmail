'use client'

import { Calendar } from 'lucide-react'
import { Avatar } from '@/components/ui'
import { cn, formatRelativeTime } from '@/lib/utils'
import type { ProjectTask, TaskStatus } from '@/lib/work-queries'

export interface TaskCardProps {
  task: ProjectTask
  /** Optional pretty project label rendered as a chip above the title. */
  projectName?: string
  projectColor?: string
  /** Optional assignee summary; if not provided the avatar slot is empty. */
  assignee?: { id: string; name: string; avatarUrl?: string | null }
  /** Highlight as the active "in progress" card on the kanban. */
  highlighted?: boolean
  onClick?: () => void
  /** Drag handlers for kanban DnD. */
  draggable?: boolean
  onDragStart?: (e: React.DragEvent<HTMLButtonElement>) => void
  onDragEnd?: (e: React.DragEvent<HTMLButtonElement>) => void
}

const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: 'Todo',
  in_progress: 'In progress',
  done: 'Done',
}

/**
 * Kanban-column card. Pencil reference: `ProjectV3.row*` cards
 * (`pBrWV`).
 *
 * The card is a button so keyboard users can land + activate. Drag is
 * opt-in via `draggable`.
 */
export function TaskCard({
  task,
  projectName,
  projectColor = '#BFFF00',
  assignee,
  highlighted,
  onClick,
  draggable,
  onDragStart,
  onDragEnd,
}: TaskCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      data-task-id={task.id}
      className={cn(
        'group flex w-full cursor-pointer flex-col gap-2 rounded-md border bg-wm-surface px-3 py-3 text-left transition-colors hover:bg-wm-surface-hover',
        highlighted
          ? 'border-wm-accent bg-wm-accent-dim'
          : 'border-wm-border',
      )}
      style={
        highlighted
          ? { boxShadow: '0 6px 20px 0 rgba(191,255,0,0.15)' }
          : undefined
      }
    >
      {projectName && (
        <span
          className="inline-flex max-w-fit items-center gap-1.5 px-2 py-px font-mono text-[9px] font-bold uppercase tracking-[1.5px]"
          style={{ backgroundColor: `${projectColor}26`, color: projectColor }}
        >
          <span aria-hidden className="h-1 w-1" style={{ backgroundColor: projectColor }} />
          {projectName}
        </span>
      )}
      <span
        className={cn(
          'font-sans text-[13px] font-medium leading-snug',
          highlighted ? 'text-wm-text-primary' : 'text-wm-text-primary',
        )}
      >
        {task.title}
      </span>
      <span className="flex items-center justify-between gap-2 pt-0.5">
        <span className="flex items-center gap-2 font-mono text-[10px] text-wm-text-tertiary">
          {task.dueDate ? (
            <>
              <Calendar className="h-3 w-3" />
              {formatRelativeTime(new Date(task.dueDate))}
            </>
          ) : (
            <span className="text-wm-text-muted">{STATUS_LABEL[task.status]}</span>
          )}
        </span>
        {assignee ? (
          <Avatar name={assignee.name} src={assignee.avatarUrl ?? undefined} size="sm" />
        ) : (
          <span aria-hidden className="h-6 w-6" />
        )}
      </span>
    </button>
  )
}
