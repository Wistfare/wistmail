'use client'

import { useState, useEffect } from 'react'
import { Calendar, Tag } from 'lucide-react'
import { Drawer, Button, FieldStack } from '@/components/ui'
import { useUpdateTask, type ProjectTask, type TaskStatus } from '@/lib/work-queries'
import { cn } from '@/lib/utils'

export interface TaskDrawerProps {
  open: boolean
  onClose: () => void
  task: ProjectTask | null
  projectName?: string
  projectColor?: string
  projectId: string
}

const STATUSES: TaskStatus[] = ['todo', 'in_progress', 'done']
const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: 'Todo',
  in_progress: 'In progress',
  done: 'Done',
}

/**
 * Right-edge drawer showing one task's detail.
 *
 * Pencil reference: `taskDrawer` (`Mxst9`) and `ProjectV3-TaskDetail`
 * (`hXcQi`). The drawer covers the rightmost ~40% of the page so the
 * kanban behind stays visible.
 */
export function TaskDrawer({
  open,
  onClose,
  task,
  projectName,
  projectColor = '#BFFF00',
  projectId,
}: TaskDrawerProps) {
  const update = useUpdateTask(projectId)
  const [title, setTitle] = useState('')
  const [status, setStatus] = useState<TaskStatus>('todo')

  useEffect(() => {
    if (task) {
      setTitle(task.title)
      setStatus(task.status)
    }
  }, [task])

  async function commitTitle() {
    if (!task) return
    if (title.trim() === task.title || !title.trim()) return
    await update.mutateAsync({ id: task.id, title: title.trim() })
  }

  async function changeStatus(next: TaskStatus) {
    if (!task) return
    setStatus(next)
    await update.mutateAsync({ id: task.id, status: next })
  }

  if (!task) {
    return (
      <Drawer open={open} onClose={onClose} title="Task" size="lg">
        <p className="px-5 py-4 font-mono text-[12px] text-wm-text-tertiary">
          Select a task to view its details.
        </p>
      </Drawer>
    )
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Task"
      size="lg"
      footer={
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="flex flex-col gap-5 px-5 py-4">
        {projectName && (
          <span
            className="inline-flex max-w-fit items-center gap-1.5 px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-[1.5px]"
            style={{ backgroundColor: `${projectColor}26`, color: projectColor }}
          >
            <span aria-hidden className="h-1.5 w-1.5" style={{ backgroundColor: projectColor }} />
            {projectName}
          </span>
        )}

        {/* Title — inline-editable. Commit on blur or Enter. */}
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              ;(e.target as HTMLInputElement).blur()
            }
          }}
          className="bg-transparent font-sans text-xl font-semibold text-wm-text-primary outline-none placeholder:text-wm-text-muted focus:underline focus:underline-offset-4"
          placeholder="Untitled task"
        />

        <FieldStack label="Status">
          <div role="tablist" className="flex overflow-hidden rounded-md border border-wm-border">
            {STATUSES.map((s, i) => {
              const active = status === s
              return (
                <button
                  key={s}
                  role="tab"
                  aria-selected={active}
                  type="button"
                  onClick={() => changeStatus(s)}
                  className={cn(
                    'flex-1 cursor-pointer px-3 py-2 font-mono text-[11px] font-bold uppercase tracking-[1.5px] transition-colors',
                    active
                      ? 'bg-wm-accent text-wm-text-on-accent'
                      : 'text-wm-text-secondary hover:bg-wm-surface-hover hover:text-wm-text-primary',
                    i > 0 && 'border-l border-wm-border',
                  )}
                >
                  {STATUS_LABEL[s]}
                </button>
              )
            })}
          </div>
        </FieldStack>

        {task.dueDate && (
          <FieldStack label="Due">
            <div className="flex items-center gap-2 font-mono text-[12px] text-wm-text-secondary">
              <Calendar className="h-3.5 w-3.5" />
              {new Date(task.dueDate).toLocaleString(undefined, {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
              })}
            </div>
          </FieldStack>
        )}

        <FieldStack label="Created">
          <div className="flex items-center gap-2 font-mono text-[12px] text-wm-text-tertiary">
            <Tag className="h-3.5 w-3.5" />
            {new Date(task.createdAt).toLocaleDateString()}
          </div>
        </FieldStack>
      </div>
    </Drawer>
  )
}
