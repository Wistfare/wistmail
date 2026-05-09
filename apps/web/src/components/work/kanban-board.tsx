'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ProjectTask, TaskStatus } from '@/lib/work-queries'
import { TaskCard } from './task-card'

export interface KanbanColumnDef {
  status: TaskStatus
  label: string
  /** Optional accent color per column; defaults to muted. */
  color?: string
}

export const DEFAULT_COLUMNS: KanbanColumnDef[] = [
  { status: 'todo', label: 'Backlog' },
  { status: 'in_progress', label: 'In progress', color: '#BFFF00' },
  { status: 'done', label: 'Done' },
]

export interface KanbanBoardProps {
  tasks: ProjectTask[]
  columns?: KanbanColumnDef[]
  onTaskClick?: (task: ProjectTask) => void
  /** Called when user drops a card on a different column. */
  onMoveTask?: (taskId: string, toStatus: TaskStatus) => void
  /** Called when user clicks the "+" header on a column. */
  onAddTask?: (status: TaskStatus) => void
  /** Optional per-task projectName/color (e.g. when board shows multiple projects). */
  projectMeta?: { name?: string; color?: string }
}

/**
 * 3-column kanban board. Pencil reference: `ProjectV3` (`pBrWV`).
 *
 * Layout: a flex row of equal-width columns, each with a header (label +
 * count + add button) and a scrollable card stack underneath. Cards
 * support native HTML5 drag-and-drop between columns; on drop we call
 * `onMoveTask` so the parent can fire an optimistic mutation.
 */
export function KanbanBoard({
  tasks,
  columns = DEFAULT_COLUMNS,
  onTaskClick,
  onMoveTask,
  onAddTask,
  projectMeta,
}: KanbanBoardProps) {
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null)
  const [overStatus, setOverStatus] = useState<TaskStatus | null>(null)

  function tasksFor(status: TaskStatus): ProjectTask[] {
    return tasks.filter((t) => t.status === status)
  }

  return (
    <div className="flex h-full gap-4 overflow-x-auto px-6 py-5">
      {columns.map((col) => {
        const colTasks = tasksFor(col.status)
        const isOver = overStatus === col.status
        return (
          <div
            key={col.status}
            onDragOver={(e) => {
              e.preventDefault()
              setOverStatus(col.status)
            }}
            onDragLeave={() => setOverStatus((s) => (s === col.status ? null : s))}
            onDrop={(e) => {
              e.preventDefault()
              setOverStatus(null)
              if (draggingTaskId) onMoveTask?.(draggingTaskId, col.status)
              setDraggingTaskId(null)
            }}
            className={cn(
              'flex h-full w-72 shrink-0 flex-col gap-3 rounded-lg border bg-wm-surface/40 p-3 transition-colors',
              isOver ? 'border-wm-accent bg-wm-accent-dim/40' : 'border-wm-border',
            )}
          >
            <header className="flex items-center justify-between">
              <span
                className="font-mono text-[10px] font-bold uppercase tracking-[1.5px]"
                style={{ color: col.color ?? 'var(--color-wm-text-secondary)' }}
              >
                {col.label}
                <span className="ml-1.5 text-wm-text-muted">{colTasks.length}</span>
              </span>
              <button
                type="button"
                onClick={() => onAddTask?.(col.status)}
                aria-label={`Add task to ${col.label}`}
                className="cursor-pointer rounded-full p-1 text-wm-text-muted transition-colors hover:bg-wm-surface-hover hover:text-wm-text-secondary"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </header>
            <div className="flex flex-1 flex-col gap-2 overflow-y-auto">
              {colTasks.length === 0 ? (
                <p className="rounded-md border border-dashed border-wm-border px-3 py-6 text-center font-mono text-[11px] text-wm-text-muted">
                  Drop a task here
                </p>
              ) : (
                colTasks.map((t) => (
                  <TaskCard
                    key={t.id}
                    task={t}
                    projectName={projectMeta?.name}
                    projectColor={projectMeta?.color ?? col.color}
                    highlighted={col.status === 'in_progress'}
                    onClick={() => onTaskClick?.(t)}
                    draggable
                    onDragStart={() => setDraggingTaskId(t.id)}
                    onDragEnd={() => {
                      setDraggingTaskId(null)
                      setOverStatus(null)
                    }}
                  />
                ))
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
