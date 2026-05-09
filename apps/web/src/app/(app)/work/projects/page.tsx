'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { PageHeader } from '@/components/shell'
import { Button, Card, EmptyState, InputField, Modal } from '@/components/ui'
import { useCreateProject, useProjects } from '@/lib/work-queries'

/**
 * `/work/projects` — index of all projects. Not formally in Pencil but
 * we need it for navigation; matches the visual language of WorkV3.
 */
export default function ProjectsIndexPage() {
  const projects = useProjects()
  const [openCreate, setOpenCreate] = useState(false)

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        eyebrow="Work"
        title="Projects"
        subtitle={projects.data ? `${projects.data.length} active` : undefined}
        actions={
          <Button icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setOpenCreate(true)}>
            New project
          </Button>
        }
      />
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {projects.isPending ? (
          <div className="flex h-32 items-center justify-center">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-wm-accent border-t-transparent" />
          </div>
        ) : !projects.data || projects.data.length === 0 ? (
          <EmptyState
            title="No projects yet"
            description="Group tasks, docs, and meetings into a project to track work end-to-end."
            action={
              <Button onClick={() => setOpenCreate(true)} icon={<Plus className="h-3.5 w-3.5" />}>
                New project
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {projects.data.map((p) => (
              <Link key={p.id} href={`/work/projects/${p.id}`}>
                <Card className="h-full transition-colors hover:border-wm-accent/50">
                  <div className="flex flex-col gap-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <h3 className="text-sm font-semibold text-wm-text-primary">{p.name}</h3>
                      <span className="font-mono text-[10px] text-wm-text-muted">
                        {p.progress}%
                      </span>
                    </div>
                    {p.description && (
                      <p className="line-clamp-2 font-mono text-[11px] text-wm-text-tertiary">
                        {p.description}
                      </p>
                    )}
                    <div className="h-1 w-full overflow-hidden bg-wm-bg">
                      <div
                        className="h-full bg-wm-accent transition-all"
                        style={{ width: `${p.progress}%` }}
                      />
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>

      <CreateProjectModal open={openCreate} onClose={() => setOpenCreate(false)} />
    </div>
  )
}

function CreateProjectModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const create = useCreateProject()
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [error, setError] = useState('')
  async function submit() {
    if (!name.trim()) return setError('Name is required')
    try {
      await create.mutateAsync({ name: name.trim(), description: desc.trim() || undefined })
      setName('')
      setDesc('')
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not create project')
    }
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New project"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={create.isPending}>Create</Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
        className="flex flex-col gap-4"
      >
        <InputField
          label="Name"
          placeholder="Wistmail v2"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          required
        />
        <InputField
          label="Description"
          placeholder="Optional"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
        />
        {error && <p className="font-mono text-[11px] text-wm-error">{error}</p>}
      </form>
    </Modal>
  )
}
