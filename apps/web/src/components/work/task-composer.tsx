'use client'

import { useEffect, useState } from 'react'
import { Modal, Button, FieldStack, InputField } from '@/components/ui'
import { useCreateTask, type TaskStatus } from '@/lib/work-queries'

export interface TaskComposerProps {
  open: boolean
  onClose: () => void
  projectId: string
  defaultStatus?: TaskStatus
}

export function TaskComposer({ open, onClose, projectId, defaultStatus = 'todo' }: TaskComposerProps) {
  const create = useCreateTask(projectId)
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setTitle('')
      setDueDate('')
      setError('')
    }
  }, [open])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return setError('Title is required')
    try {
      await create.mutateAsync({
        title: title.trim(),
        status: defaultStatus,
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
      })
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not create task')
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New task"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={create.isPending}
            onClick={(e) => submit(e as unknown as React.FormEvent)}
          >
            Create
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <InputField
          label="Title"
          placeholder="Build kanban dropdown variants"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
          required
        />
        <FieldStack label="Due">
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="h-[42px] w-full border border-wm-border bg-wm-surface px-3 font-mono text-[13px] text-wm-text-primary outline-none focus:border-wm-accent"
          />
        </FieldStack>
        {error && <p className="font-mono text-[11px] text-wm-error">{error}</p>}
      </form>
    </Modal>
  )
}
