'use client'

import { useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Plus } from 'lucide-react'
import { PageHeader } from '@/components/shell'
import { Button, Skeleton } from '@/components/ui'
import {
  KanbanBoard,
  TaskComposer,
  TaskDrawer,
} from '@/components/work'
import {
  useProject,
  useTasks,
  useUpdateTask,
  type ProjectTask,
  type TaskStatus,
} from '@/lib/work-queries'

/** `/work/projects/[id]` — Pencil reference: `ProjectV3` (`pBrWV`) + `taskDrawer` (`Mxst9`). */
export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>()
  const projectId = params.id
  const project = useProject(projectId)
  const tasks = useTasks(projectId)
  const update = useUpdateTask(projectId)

  const [composerOpen, setComposerOpen] = useState(false)
  const [composerStatus, setComposerStatus] = useState<TaskStatus>('todo')
  const [openTask, setOpenTask] = useState<ProjectTask | null>(null)

  const projectColor = useMemo(() => '#BFFF00', [])

  function moveTask(taskId: string, toStatus: TaskStatus) {
    const t = tasks.data?.find((t) => t.id === taskId)
    if (!t || t.status === toStatus) return
    update.mutate({ id: taskId, status: toStatus })
  }

  function addTask(status: TaskStatus) {
    setComposerStatus(status)
    setComposerOpen(true)
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        eyebrow={
          <Link href="/work/projects" className="inline-flex items-center gap-1 hover:text-wm-accent">
            <ArrowLeft className="h-3 w-3" />
            All projects
          </Link>
        }
        title={project.data?.name ?? '—'}
        subtitle={
          project.data
            ? `${project.data.progress}% complete · ${tasks.data?.length ?? 0} tasks`
            : undefined
        }
        actions={
          <Button icon={<Plus className="h-3.5 w-3.5" />} onClick={() => addTask('todo')}>
            New task
          </Button>
        }
      />

      <div className="flex-1 overflow-hidden">
        {tasks.isPending ? (
          <div className="flex gap-4 px-6 py-5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex w-72 flex-col gap-2 rounded-lg border border-wm-border bg-wm-surface/40 p-3">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton rows={3} />
              </div>
            ))}
          </div>
        ) : (
          <KanbanBoard
            tasks={tasks.data ?? []}
            projectMeta={{ name: project.data?.name, color: projectColor }}
            onTaskClick={setOpenTask}
            onMoveTask={moveTask}
            onAddTask={addTask}
          />
        )}
      </div>

      <TaskComposer
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        projectId={projectId}
        defaultStatus={composerStatus}
      />
      <TaskDrawer
        open={openTask !== null}
        onClose={() => setOpenTask(null)}
        task={openTask}
        projectId={projectId}
        projectName={project.data?.name}
        projectColor={projectColor}
      />
    </div>
  )
}
