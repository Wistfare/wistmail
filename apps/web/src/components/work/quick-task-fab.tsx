'use client'

import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCreateTask, useProjects } from '@/lib/work-queries'

export interface QuickTaskFabProps {
  /** Default project id when none is selected — typically the most-recent. */
  defaultProjectId?: string
  className?: string
}

/**
 * Bottom-left "+ Quick task" pill.
 *
 * Pencil reference: `WorkV3` bottom-left FAB (`QAyVs`). Click expands a
 * small inline panel with a title input + project picker. Submitting
 * fires `useCreateTask()` against the chosen project.
 */
export function QuickTaskFab({ defaultProjectId, className }: QuickTaskFabProps) {
  const projects = useProjects()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [projectId, setProjectId] = useState(defaultProjectId ?? '')
  const fallbackId = defaultProjectId ?? projects.data?.[0]?.id ?? ''
  const effectiveProjectId = projectId || fallbackId
  const create = useCreateTask(effectiveProjectId)

  function reset() {
    setTitle('')
    setProjectId('')
    setOpen(false)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !effectiveProjectId) return
    try {
      await create.mutateAsync({ title: title.trim() })
      reset()
    } catch {
      // Surface error in form area; for now just keep the panel open.
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Quick task"
        className={cn(
          'fixed bottom-5 left-20 z-30 inline-flex h-11 cursor-pointer items-center gap-2 rounded-full bg-wm-accent px-4 font-mono text-[12px] font-bold uppercase tracking-[1.5px] text-wm-text-on-accent shadow-lg transition-colors hover:bg-wm-accent-hover',
          className,
        )}
        style={{ boxShadow: '0 8px 24px 0 rgba(191,255,0,0.25)' }}
      >
        <Plus className="h-4 w-4" />
        Quick task
      </button>
    )
  }

  return (
    <form
      onSubmit={submit}
      className={cn(
        'fixed bottom-5 left-20 z-30 flex w-80 flex-col gap-2 rounded-xl border border-wm-accent bg-wm-surface p-3 shadow-2xl',
        className,
      )}
      style={{ boxShadow: '0 8px 32px 0 rgba(191,255,0,0.2)' }}
    >
      <header className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] font-bold uppercase tracking-[1.5px] text-wm-accent">
          Quick task
        </span>
        <button
          type="button"
          onClick={reset}
          aria-label="Cancel"
          className="cursor-pointer text-wm-text-muted hover:text-wm-text-secondary"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </header>

      <input
        type="text"
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="What needs doing?"
        maxLength={500}
        className="rounded-md border border-wm-border bg-wm-bg px-3 py-2 font-sans text-[13px] text-wm-text-primary outline-none placeholder:text-wm-text-muted focus:border-wm-accent"
      />

      <select
        value={effectiveProjectId}
        onChange={(e) => setProjectId(e.target.value)}
        className="rounded-md border border-wm-border bg-wm-bg px-3 py-2 font-mono text-[12px] text-wm-text-secondary outline-none focus:border-wm-accent"
      >
        {projects.isPending && <option>Loading projects…</option>}
        {!projects.isPending && (projects.data ?? []).length === 0 && (
          <option value="">No projects — create one first</option>
        )}
        {(projects.data ?? []).map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>

      <button
        type="submit"
        disabled={!title.trim() || !effectiveProjectId || create.isPending}
        className={cn(
          'inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-full bg-wm-accent font-mono text-[11px] font-bold uppercase tracking-[1.5px] text-wm-text-on-accent transition-colors hover:bg-wm-accent-hover',
          'disabled:cursor-not-allowed disabled:opacity-60',
        )}
      >
        <Plus className="h-3.5 w-3.5" />
        {create.isPending ? 'Adding…' : 'Add task'}
      </button>
    </form>
  )
}
