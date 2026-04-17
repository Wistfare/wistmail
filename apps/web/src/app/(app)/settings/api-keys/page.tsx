'use client'

import { useState, useEffect } from 'react'
import { Key, Plus, Copy, Trash2, Shield, Check, X, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { InputField } from '@/components/ui/input-field'
import { Badge } from '@/components/ui/badge'
import { api } from '@/lib/api-client'
import { formatRelativeTime } from '@/lib/utils'

type ApiKey = {
  id: string
  keyPrefix: string
  name: string
  scopes: string[]
  lastUsedAt: string | null
  createdAt: string
}

type PanelMode = 'none' | 'create' | 'created' | 'delete'

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [panelMode, setPanelMode] = useState<PanelMode>('none')

  // create form
  const [newKeyName, setNewKeyName] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  // created state (show full key once)
  const [createdKey, setCreatedKey] = useState<{ name: string; key: string } | null>(null)
  const [copied, setCopied] = useState(false)

  // delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<ApiKey | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    api.get<{ data: ApiKey[] }>('/api/v1/api-keys').then((res) => setKeys(res.data)).catch(() => {})
  }, [])

  function openCreate() {
    setNewKeyName('')
    setCreateError('')
    setPanelMode('create')
  }

  function openDelete(key: ApiKey) {
    setDeleteTarget(key)
    setDeleteConfirm('')
    setPanelMode('delete')
  }

  async function handleCreate() {
    if (!newKeyName.trim()) { setCreateError('Name is required'); return }
    setCreating(true)
    setCreateError('')
    try {
      const result = await api.post<{ id: string; key: string; name: string; keyPrefix: string; scopes: string[]; createdAt: string }>(
        '/api/v1/api-keys',
        { name: newKeyName.trim(), scopes: ['emails:send', 'emails:read', 'webhooks:manage', 'contacts:manage', 'domains:manage'] },
      )
      setCreatedKey({ name: result.name, key: result.key })
      setKeys((prev) => [{ ...result, lastUsedAt: null }, ...prev])
      setPanelMode('created')
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create')
    } finally {
      setCreating(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    if (deleteConfirm !== deleteTarget.name) return
    setDeleting(true)
    try {
      await api.delete(`/api/v1/api-keys/${deleteTarget.id}`)
      setKeys((prev) => prev.filter((k) => k.id !== deleteTarget.id))
      setPanelMode('none')
      setDeleteTarget(null)
    } catch {} finally {
      setDeleting(false)
    }
  }

  async function copyToClipboard(text: string) {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex h-full">
      <div className="flex flex-1 flex-col overflow-y-auto">
        {/* Header */}
        <div className="flex items-center gap-4 border-b border-wm-border bg-wm-surface px-8 py-4">
          <h1 className="text-lg font-semibold text-wm-text-primary">API Keys</h1>
          <span className="font-mono text-xs text-wm-text-muted">Manage API keys for the transactional email API</span>
          <div className="flex-1" />
          <Button variant="primary" size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={openCreate}>
            Create Key
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-8">
          {/* Security warning */}
          <div className="mb-6 flex items-start gap-3 border border-wm-accent/20 bg-wm-accent/5 p-4">
            <Shield className="mt-0.5 h-4 w-4 text-wm-accent" />
            <p className="font-mono text-xs text-wm-text-secondary">
              API keys grant programmatic access to send emails. Keep them secure and never share in public repositories.
            </p>
          </div>

          {/* Keys table */}
          <div className="border border-wm-border">
            <div className="flex items-center border-b border-wm-border bg-wm-surface px-4 py-2">
              <span className="w-[200px] font-mono text-[10px] font-semibold tracking-wider text-wm-text-muted">NAME</span>
              <span className="w-[200px] font-mono text-[10px] font-semibold tracking-wider text-wm-text-muted">KEY</span>
              <span className="w-[180px] font-mono text-[10px] font-semibold tracking-wider text-wm-text-muted">SCOPES</span>
              <span className="flex-1 font-mono text-[10px] font-semibold tracking-wider text-wm-text-muted">LAST USED</span>
              <span className="w-[60px]" />
            </div>

            {keys.map((key) => (
              <div key={key.id} className="flex items-center border-b border-wm-border px-4 py-3 last:border-b-0 hover:bg-wm-surface-hover transition-colors">
                <span className="w-[200px] text-sm text-wm-text-primary">{key.name}</span>
                <code className="w-[200px] font-mono text-xs text-wm-text-secondary">{key.keyPrefix}...████</code>
                <div className="w-[180px] flex flex-wrap gap-1">
                  {(key.scopes as string[]).slice(0, 2).map((scope) => (
                    <Badge key={scope} variant="default" size="sm">{scope.split(':')[0]}</Badge>
                  ))}
                  {(key.scopes as string[]).length > 2 && (
                    <Badge variant="default" size="sm">+{(key.scopes as string[]).length - 2}</Badge>
                  )}
                </div>
                <span className="flex-1 font-mono text-xs text-wm-text-muted">
                  {key.lastUsedAt ? formatRelativeTime(new Date(key.lastUsedAt)) : 'Never'}
                </span>
                <div className="w-[60px] flex justify-end">
                  <button onClick={() => openDelete(key)} className="cursor-pointer text-wm-text-muted hover:text-wm-error">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}

            {keys.length === 0 && (
              <div className="flex flex-col items-center gap-3 py-12 text-center">
                <Key className="h-8 w-8 text-wm-text-muted" />
                <p className="font-mono text-sm text-wm-text-tertiary">No API keys yet. Create one to start sending emails via the API.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Right Side Panel ── */}
      {panelMode !== 'none' && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setPanelMode('none')} />
          <div className="fixed right-0 top-0 z-50 flex h-full w-[380px] flex-col border-l border-wm-border bg-wm-surface shadow-2xl">
            {/* CREATE */}
            {panelMode === 'create' && (
              <>
                <div className="flex items-center justify-between border-b border-wm-border px-6 py-4">
                  <h2 className="text-base font-semibold text-wm-text-primary">Create API Key</h2>
                  <button onClick={() => setPanelMode('none')} className="cursor-pointer text-wm-text-muted hover:text-wm-text-secondary">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto px-6 py-5">
                  <div className="flex flex-col gap-4">
                    <InputField
                      label="Key name"
                      value={newKeyName}
                      onChange={(e) => setNewKeyName(e.target.value)}
                      placeholder="Production"
                      hint="Give this key a descriptive name to identify it later"
                      error={createError}
                    />
                    <div>
                      <label className="mb-2 block font-mono text-[10px] font-semibold tracking-wider text-wm-text-muted">SCOPES</label>
                      <div className="flex flex-wrap gap-1.5">
                        {['emails:send', 'emails:read', 'webhooks:manage', 'contacts:manage', 'domains:manage'].map((scope) => (
                          <Badge key={scope} variant="accent" size="sm">{scope}</Badge>
                        ))}
                      </div>
                      <p className="mt-2 font-mono text-[10px] text-wm-text-muted">
                        Keys are created with full access. Scope-based restrictions coming soon.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex gap-3 border-t border-wm-border px-6 py-4">
                  <Button variant="secondary" size="sm" onClick={() => setPanelMode('none')} className="flex-1">Cancel</Button>
                  <Button variant="primary" size="sm" loading={creating} onClick={handleCreate} className="flex-1">Create Key</Button>
                </div>
              </>
            )}

            {/* CREATED (show key once) */}
            {panelMode === 'created' && createdKey && (
              <>
                <div className="flex items-center justify-between border-b border-wm-border px-6 py-4">
                  <h2 className="text-base font-semibold text-wm-text-primary">Key Created</h2>
                  <button onClick={() => setPanelMode('none')} className="cursor-pointer text-wm-text-muted hover:text-wm-text-secondary">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto px-6 py-5">
                  <div className="flex flex-col gap-5">
                    <div className="flex items-start gap-3 border border-wm-warning/30 bg-wm-warning/5 p-3">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-wm-warning" />
                      <p className="font-mono text-[11px] leading-relaxed text-wm-text-secondary">
                        Copy this key now — it won't be shown again. Store it securely (e.g., as an environment variable).
                      </p>
                    </div>
                    <div>
                      <label className="mb-1 block font-mono text-[10px] font-semibold tracking-wider text-wm-text-muted">NAME</label>
                      <p className="text-sm text-wm-text-primary">{createdKey.name}</p>
                    </div>
                    <div>
                      <label className="mb-1 block font-mono text-[10px] font-semibold tracking-wider text-wm-text-muted">API KEY</label>
                      <div className="flex items-center gap-2 border border-wm-accent/40 bg-wm-bg p-3">
                        <code className="flex-1 font-mono text-[11px] text-wm-accent break-all">{createdKey.key}</code>
                        <button onClick={() => copyToClipboard(createdKey.key)} className="shrink-0 cursor-pointer text-wm-accent hover:text-wm-accent-hover">
                          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="border-t border-wm-border px-6 py-4">
                  <Button variant="primary" size="sm" onClick={() => setPanelMode('none')} className="w-full">Done</Button>
                </div>
              </>
            )}

            {/* DELETE CONFIRMATION */}
            {panelMode === 'delete' && deleteTarget && (
              <>
                <div className="flex items-center justify-between border-b border-wm-border px-6 py-4">
                  <h2 className="text-base font-semibold text-wm-error">Revoke API Key</h2>
                  <button onClick={() => setPanelMode('none')} className="cursor-pointer text-wm-text-muted hover:text-wm-text-secondary">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto px-6 py-5">
                  <div className="flex flex-col gap-5">
                    <div className="flex items-start gap-3 border border-wm-error/30 bg-wm-error/5 p-3">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-wm-error" />
                      <div>
                        <p className="text-xs font-medium text-wm-error">This action cannot be undone</p>
                        <p className="mt-1 font-mono text-[10px] leading-relaxed text-wm-text-secondary">
                          Any application using this key will immediately lose access.
                        </p>
                      </div>
                    </div>
                    <div>
                      <label className="mb-1 block font-mono text-[10px] font-semibold tracking-wider text-wm-text-muted">KEY TO REVOKE</label>
                      <p className="text-sm text-wm-text-primary">{deleteTarget.name}</p>
                      <code className="font-mono text-[10px] text-wm-text-muted">{deleteTarget.keyPrefix}...████</code>
                    </div>
                    <InputField
                      label={`Type "${deleteTarget.name}" to confirm`}
                      value={deleteConfirm}
                      onChange={(e) => setDeleteConfirm(e.target.value)}
                      placeholder={deleteTarget.name}
                    />
                  </div>
                </div>
                <div className="flex gap-3 border-t border-wm-border px-6 py-4">
                  <Button variant="secondary" size="sm" onClick={() => setPanelMode('none')} className="flex-1">Cancel</Button>
                  <Button
                    variant="danger"
                    size="sm"
                    icon={<Trash2 className="h-3.5 w-3.5" />}
                    loading={deleting}
                    onClick={handleDelete}
                    disabled={deleteConfirm !== deleteTarget.name}
                    className="flex-1"
                  >
                    Revoke Key
                  </Button>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
