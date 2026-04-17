'use client'

import { useState, useRef } from 'react'
import { Plus, Pencil, Trash2, X, Image as ImageIcon, Type, AlertTriangle, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { InputField } from '@/components/ui/input-field'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

type Signature = {
  id: string
  name: string
  content: string // Plain text content
  html: string | null // Optional HTML with image
  logoDataUrl: string | null // Optional logo image as data URL
  isDefault: boolean
}

type PanelMode = 'none' | 'create' | 'edit' | 'delete'

export default function SignaturesPage() {
  const [signatures, setSignatures] = useState<Signature[]>([
    {
      id: '1',
      name: 'Default',
      content: 'Vedadom\nFounder, Wistfare\nv@wistfare.com · wistfare.com',
      html: null,
      logoDataUrl: null,
      isDefault: true,
    },
    {
      id: '2',
      name: 'Personal',
      content: 'V.\nSent from Wistfare Mail',
      html: null,
      logoDataUrl: null,
      isDefault: false,
    },
  ])

  const [panelMode, setPanelMode] = useState<PanelMode>('none')
  const [editing, setEditing] = useState<Signature | null>(null)
  const [draft, setDraft] = useState<Signature>({
    id: '', name: '', content: '', html: null, logoDataUrl: null, isDefault: false,
  })
  const fileInputRef = useRef<HTMLInputElement>(null)

  function openCreate() {
    setDraft({ id: 'new-' + Date.now(), name: '', content: '', html: null, logoDataUrl: null, isDefault: false })
    setEditing(null)
    setPanelMode('create')
  }

  function openEdit(sig: Signature) {
    setEditing(sig)
    setDraft({ ...sig })
    setPanelMode('edit')
  }

  function openDelete(sig: Signature) {
    setEditing(sig)
    setPanelMode('delete')
  }

  function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 500 * 1024) {
      alert('Logo must be under 500KB')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      setDraft((d) => ({ ...d, logoDataUrl: reader.result as string }))
    }
    reader.readAsDataURL(file)
  }

  function removeLogo() {
    setDraft((d) => ({ ...d, logoDataUrl: null }))
  }

  function saveSignature() {
    if (!draft.name.trim()) return

    if (panelMode === 'create') {
      setSignatures((prev) => [...prev, draft])
    } else {
      setSignatures((prev) => prev.map((s) => (s.id === draft.id ? draft : s)))
    }
    setPanelMode('none')
  }

  function deleteSignature() {
    if (!editing) return
    setSignatures((prev) => prev.filter((s) => s.id !== editing.id))
    setPanelMode('none')
  }

  function setDefault(id: string) {
    setSignatures((prev) => prev.map((s) => ({ ...s, isDefault: s.id === id })))
  }

  // Render signature with logo + content
  function renderSignature(sig: Signature) {
    return (
      <div className="flex items-start gap-3">
        {sig.logoDataUrl && (
          <img src={sig.logoDataUrl} alt="Logo" className="h-12 w-auto max-w-[80px] object-contain" />
        )}
        <pre className="flex-1 whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-wm-text-secondary">
          {sig.content || '(empty)'}
        </pre>
      </div>
    )
  }

  return (
    <div className="flex h-full">
      <div className="flex flex-1 flex-col overflow-y-auto">
        {/* Consistent page header */}
        <div className="flex items-center gap-3 px-8 py-6">
          <h1 className="text-2xl font-semibold text-wm-text-primary">Signatures</h1>
          <div className="flex-1" />
          <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={openCreate}>
            New Signature
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-8 pb-8">
          {signatures.length === 0 ? (
            <div className="flex flex-col items-center gap-4 py-20 text-center border border-wm-border">
              <Type className="h-10 w-10 text-wm-text-muted" />
              <p className="font-mono text-sm text-wm-text-tertiary">No signatures yet.</p>
              <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={openCreate}>
                Create your first signature
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {signatures.map((sig) => (
                <div key={sig.id} className="border border-wm-border bg-wm-surface">
                  {/* Header */}
                  <div className="flex items-center gap-2 border-b border-wm-border px-5 py-3">
                    <p className="text-sm font-medium text-wm-text-primary">{sig.name}</p>
                    {sig.isDefault && <Badge variant="accent" size="sm">Default</Badge>}
                    <div className="flex-1" />
                    {!sig.isDefault && (
                      <button onClick={() => setDefault(sig.id)} className="cursor-pointer font-mono text-[11px] text-wm-text-muted hover:text-wm-text-secondary">
                        Set as default
                      </button>
                    )}
                    <button onClick={() => openEdit(sig)} className="cursor-pointer text-wm-text-muted hover:text-wm-text-secondary">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => openDelete(sig)} className="cursor-pointer text-wm-text-muted hover:text-wm-error">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* Preview */}
                  <div className="bg-wm-bg p-5">
                    {renderSignature(sig)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Side panel */}
      {panelMode !== 'none' && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setPanelMode('none')} />
          <div className="fixed right-0 top-0 z-50 flex h-full w-[440px] flex-col border-l border-wm-border bg-wm-surface shadow-2xl">
            {(panelMode === 'create' || panelMode === 'edit') && (
              <>
                <div className="flex items-center justify-between border-b border-wm-border px-6 py-4">
                  <h2 className="text-base font-semibold text-wm-text-primary">
                    {panelMode === 'create' ? 'New Signature' : 'Edit Signature'}
                  </h2>
                  <button onClick={() => setPanelMode('none')} className="cursor-pointer text-wm-text-muted hover:text-wm-text-secondary">
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-5">
                  <div className="flex flex-col gap-4">
                    <InputField
                      label="Name"
                      value={draft.name}
                      onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                      placeholder="e.g., Work signature"
                    />

                    {/* Logo upload */}
                    <div>
                      <label className="mb-1 block font-mono text-[10px] font-semibold tracking-wider text-wm-text-muted">LOGO (OPTIONAL)</label>
                      {draft.logoDataUrl ? (
                        <div className="flex items-center gap-3 border border-wm-border bg-wm-bg p-3">
                          <img src={draft.logoDataUrl} alt="Logo" className="h-12 w-auto max-w-[80px] object-contain" />
                          <button onClick={removeLogo} className="cursor-pointer font-mono text-[11px] text-wm-error hover:underline">
                            Remove
                          </button>
                        </div>
                      ) : (
                        <>
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/png,image/jpeg,image/svg+xml"
                            onChange={handleLogoUpload}
                            className="hidden"
                          />
                          <button
                            onClick={() => fileInputRef.current?.click()}
                            className="flex w-full cursor-pointer items-center justify-center gap-2 border border-dashed border-wm-border bg-wm-bg px-3 py-4 text-wm-text-muted hover:border-wm-text-muted hover:text-wm-text-secondary transition-colors"
                          >
                            <ImageIcon className="h-4 w-4" />
                            <span className="font-mono text-[11px]">Upload logo (PNG, JPG, SVG · max 500KB)</span>
                          </button>
                        </>
                      )}
                    </div>

                    {/* Content textarea */}
                    <div>
                      <label className="mb-1 block font-mono text-[10px] font-semibold tracking-wider text-wm-text-muted">CONTENT</label>
                      <textarea
                        value={draft.content}
                        onChange={(e) => setDraft({ ...draft, content: e.target.value })}
                        rows={7}
                        placeholder={'Your Name\nJob Title, Company\nemail@company.com'}
                        className="w-full border border-wm-border bg-wm-bg px-3 py-2 font-mono text-[11px] text-wm-text-primary placeholder:text-wm-text-muted outline-none focus:border-wm-accent resize-y"
                      />
                      <p className="mt-1 font-mono text-[10px] text-wm-text-muted">
                        Plain text. Line breaks are preserved.
                      </p>
                    </div>

                    {/* Preview */}
                    <div>
                      <label className="mb-1 block font-mono text-[10px] font-semibold tracking-wider text-wm-text-muted">PREVIEW</label>
                      <div className="border border-wm-border bg-wm-bg p-4">
                        {renderSignature(draft)}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 border-t border-wm-border px-6 py-4">
                  <Button variant="secondary" size="sm" onClick={() => setPanelMode('none')} className="flex-1">Cancel</Button>
                  <Button variant="primary" size="sm" icon={<Check className="h-3.5 w-3.5" />} onClick={saveSignature} disabled={!draft.name.trim()} className="flex-1">
                    {panelMode === 'create' ? 'Create' : 'Save'}
                  </Button>
                </div>
              </>
            )}

            {panelMode === 'delete' && editing && (
              <>
                <div className="flex items-center justify-between border-b border-wm-border px-6 py-4">
                  <h2 className="text-base font-semibold text-wm-error">Delete Signature</h2>
                  <button onClick={() => setPanelMode('none')} className="cursor-pointer text-wm-text-muted hover:text-wm-text-secondary">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto px-6 py-5">
                  <div className="flex flex-col gap-4">
                    <div className="flex items-start gap-3 border border-wm-error/30 bg-wm-error/5 p-3">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-wm-error" />
                      <p className="font-mono text-[11px] leading-relaxed text-wm-text-secondary">
                        Delete <strong className="text-wm-text-primary">{editing.name}</strong>? This cannot be undone.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex gap-3 border-t border-wm-border px-6 py-4">
                  <Button variant="secondary" size="sm" onClick={() => setPanelMode('none')} className="flex-1">Cancel</Button>
                  <Button variant="danger" size="sm" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={deleteSignature} className="flex-1">Delete</Button>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
