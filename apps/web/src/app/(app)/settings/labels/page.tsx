'use client'

import { useEffect, useState } from 'react'
import { Plus, Trash2, Tag, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { InputField } from '@/components/ui/input-field'
import { SettingsCard } from '@/components/ui/settings-card'
import { LabelDot } from '@/components/ui/label-dot'
import { getMailboxes, type Mailbox } from '@/lib/mailboxes-cache'
import {
  useCreateLabel,
  useDeleteLabel,
  useLabels,
  useUpdateLabel,
  type Label,
} from '@/lib/labels'

const PRESET_COLORS = [
  '#C5F135', // wm-accent
  '#3B82F6',
  '#A78BFA',
  '#F472B6',
  '#FB923C',
  '#FACC15',
  '#10B981',
  '#EF4444',
  '#94A3B8',
]

export default function LabelsSettingsPage() {
  const labelsQuery = useLabels()
  const createMutation = useCreateLabel()
  const updateMutation = useUpdateLabel()
  const deleteMutation = useDeleteLabel()

  const [mailboxes, setMailboxes] = useState<Mailbox[]>([])

  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(PRESET_COLORS[0])
  const [newMailboxId, setNewMailboxId] = useState('')

  useEffect(() => {
    getMailboxes().then((list) => {
      setMailboxes(list)
      if (list.length > 0 && !newMailboxId) setNewMailboxId(list[0].id)
    })
  }, [newMailboxId])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim() || !newMailboxId) return
    await createMutation.mutateAsync({
      name: newName.trim(),
      color: newColor,
      mailboxId: newMailboxId,
    })
    setNewName('')
  }

  // New users with no provisioned mailbox can't create labels — labels
  // are scoped per-mailbox at the schema level. Show a clear path back
  // to /settings/domains rather than leaving a disabled form behind.
  const noMailbox = mailboxes.length === 0

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-wm-text-primary">Labels</h1>

      {noMailbox && (
        <div className="border border-wm-warning/40 bg-wm-warning/10 px-4 py-3">
          <p className="font-mono text-xs text-wm-text-secondary">
            You need at least one verified mailbox before you can create
            labels. Set one up under{' '}
            <a
              href="/settings/domains"
              className="font-semibold text-wm-warning underline"
            >
              Settings → Domains
            </a>
            .
          </p>
        </div>
      )}

      <SettingsCard
        title="Create label"
        description="Group emails by topic, project, or anything else."
      >
        <form onSubmit={handleCreate} className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <InputField
              label="Name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Priority"
              icon={<Tag className="h-[18px] w-[18px]" />}
              className="flex-1"
            />
            {mailboxes.length > 1 && (
              <div className="flex flex-col gap-1 sm:w-64">
                <label className="font-mono text-[11px] text-wm-text-muted">
                  Mailbox
                </label>
                <select
                  value={newMailboxId}
                  onChange={(e) => setNewMailboxId(e.target.value)}
                  className="border border-wm-border bg-wm-surface px-3 py-2 text-sm text-wm-text-primary focus:border-wm-accent focus:outline-none"
                >
                  {mailboxes.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.address}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label className="font-mono text-[11px] text-wm-text-muted">
              Color
            </label>
            <div className="flex flex-wrap gap-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setNewColor(c)}
                  className={`h-6 w-6 border-2 transition-all ${
                    newColor === c
                      ? 'border-wm-text-primary scale-110'
                      : 'border-transparent'
                  }`}
                  style={{ backgroundColor: c }}
                  aria-label={`Pick color ${c}`}
                />
              ))}
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              type="submit"
              variant="primary"
              size="sm"
              icon={<Plus className="h-3.5 w-3.5" />}
              loading={createMutation.isPending}
              disabled={!newName.trim() || !newMailboxId}
            >
              Create
            </Button>
          </div>
        </form>
      </SettingsCard>

      <SettingsCard
        title={`Your labels (${labelsQuery.data?.length ?? 0})`}
        description="Click a label name to rename. Use the trash icon to delete."
      >
        {labelsQuery.isPending ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-wm-accent" />
          </div>
        ) : labelsQuery.data && labelsQuery.data.length === 0 ? (
          <p className="font-mono text-xs text-wm-text-muted">
            No labels yet. Create one above to start organizing.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-wm-border">
            {labelsQuery.data?.map((label) => (
              <LabelRow
                key={label.id}
                label={label}
                onUpdate={(name) =>
                  updateMutation.mutate({ id: label.id, name })
                }
                onUpdateColor={(color) =>
                  updateMutation.mutate({ id: label.id, color })
                }
                onDelete={() => deleteMutation.mutate(label.id)}
              />
            ))}
          </ul>
        )}
      </SettingsCard>
    </div>
  )
}

function LabelRow({
  label,
  onUpdate,
  onUpdateColor,
  onDelete,
}: {
  label: Label
  onUpdate: (name: string) => void
  onUpdateColor: (color: string) => void
  onDelete: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(label.name)
  const [showColors, setShowColors] = useState(false)

  function commit() {
    setEditing(false)
    if (draft.trim() && draft.trim() !== label.name) onUpdate(draft.trim())
  }

  return (
    <li className="flex items-center gap-3 py-3">
      <button
        type="button"
        onClick={() => setShowColors(!showColors)}
        className="h-4 w-4 shrink-0 cursor-pointer transition-transform hover:scale-110"
        style={{ backgroundColor: label.color }}
        title="Change color"
      />
      {editing ? (
        <input
          autoFocus
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') {
              setDraft(label.name)
              setEditing(false)
            }
          }}
          className="flex-1 border-b border-wm-accent bg-transparent text-sm text-wm-text-primary outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="flex-1 cursor-text text-left text-sm text-wm-text-primary hover:text-wm-accent"
        >
          {label.name}
        </button>
      )}

      {showColors && (
        <div className="flex flex-wrap gap-1">
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => {
                onUpdateColor(c)
                setShowColors(false)
              }}
              className="h-5 w-5 transition-transform hover:scale-110"
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => {
          if (
            confirm(
              `Delete the "${label.name}" label? Existing emails will lose this tag.`,
            )
          ) {
            onDelete()
          }
        }}
        className="cursor-pointer text-wm-text-muted hover:text-wm-error"
        title="Delete label"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </li>
  )
}

// Suppress unused-import lint — LabelDot is used by other consumers
// of this module's CSS but the page doesn't need it directly.
void LabelDot
