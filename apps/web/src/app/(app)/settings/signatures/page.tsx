'use client'

import { useState } from 'react'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { InputField } from '@/components/ui/input-field'
import { SettingsCard } from '@/components/ui/settings-card'
import { Badge } from '@/components/ui/badge'

type Signature = { id: string; name: string; content: string; isDefault: boolean }

export default function SignaturesPage() {
  const [signatures, setSignatures] = useState<Signature[]>([
    { id: '1', name: 'Default Signature', content: 'Vedadom\nFounder, Wistfare\nv@wistfare.com · wistfare.com', isDefault: true },
    { id: '2', name: 'Personal', content: 'V.\nSent from WistMail', isDefault: false },
  ])
  const [editing, setEditing] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editContent, setEditContent] = useState('')

  function startEdit(sig: Signature) {
    setEditing(sig.id)
    setEditName(sig.name)
    setEditContent(sig.content)
  }

  function saveEdit() {
    setSignatures((sigs) =>
      sigs.map((s) => (s.id === editing ? { ...s, name: editName, content: editContent } : s)),
    )
    setEditing(null)
  }

  function addSignature() {
    const id = 'new-' + Date.now()
    setSignatures((sigs) => [...sigs, { id, name: 'New Signature', content: '', isDefault: false }])
    startEdit({ id, name: 'New Signature', content: '', isDefault: false })
  }

  function deleteSignature(id: string) {
    setSignatures((sigs) => sigs.filter((s) => s.id !== id))
  }

  function setDefault(id: string) {
    setSignatures((sigs) =>
      sigs.map((s) => ({ ...s, isDefault: s.id === id })),
    )
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold text-wm-text-primary">Signatures</h1>
        <div className="flex-1" />
        <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={addSignature}>
          New Signature
        </Button>
      </div>

      {signatures.map((sig) => (
        <SettingsCard key={sig.id} title="">
          {editing === sig.id ? (
            <div className="flex flex-col gap-4">
              <InputField label="Name" value={editName} onChange={(e) => setEditName(e.target.value)} />
              <div className="flex flex-col gap-1.5">
                <label className="font-mono text-sm font-medium text-wm-text-secondary">Signature content</label>
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  rows={5}
                  className="w-full border border-wm-border bg-wm-surface px-4 py-3 font-mono text-sm text-wm-text-primary placeholder:text-wm-text-muted outline-none focus:border-wm-accent focus:ring-1 focus:ring-wm-accent"
                />
              </div>
              <div className="flex gap-3">
                <Button variant="primary" size="sm" onClick={saveEdit}>Save</Button>
                <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <p className="font-medium text-wm-text-primary">{sig.name}</p>
                {sig.isDefault && <Badge variant="accent" size="sm">Default</Badge>}
                <div className="flex-1" />
                {!sig.isDefault && (
                  <Button variant="ghost" size="sm" onClick={() => setDefault(sig.id)}>
                    Set as default
                  </Button>
                )}
                <button className="cursor-pointer text-wm-text-muted hover:text-wm-text-secondary" onClick={() => startEdit(sig)}>
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button className="cursor-pointer text-wm-text-muted hover:text-wm-error" onClick={() => deleteSignature(sig.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="mt-3 border border-wm-border bg-wm-bg p-4">
                <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-wm-text-secondary">
                  {sig.content}
                </pre>
              </div>
            </>
          )}
        </SettingsCard>
      ))}
    </div>
  )
}
