'use client'

import { useState, useEffect } from 'react'
import { Key, Plus, Copy, Trash2, Shield, Check } from 'lucide-react'
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

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [newKeyName, setNewKeyName] = useState('')
  const [creating, setCreating] = useState(false)
  const [newKeyFull, setNewKeyFull] = useState('')
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get<{ data: ApiKey[] }>('/api/v1/api-keys').then((res) => {
      setKeys(res.data)
    }).catch(() => {})
  }, [])

  async function handleCreate() {
    if (!newKeyName.trim()) { setError('Name is required'); return }
    setCreating(true)
    setError('')
    try {
      const result = await api.post<{ id: string; key: string; name: string; keyPrefix: string; scopes: string[]; createdAt: string }>(
        '/api/v1/api-keys',
        { name: newKeyName.trim(), scopes: ['emails:send', 'emails:read'] },
      )
      setNewKeyFull(result.key)
      setKeys((prev) => [{ ...result, lastUsedAt: null }, ...prev])
      setNewKeyName('')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create')
    } finally {
      setCreating(false)
    }
  }

  async function handleDelete(id: string) {
    try {
      await api.delete(`/api/v1/api-keys/${id}`)
      setKeys((prev) => prev.filter((k) => k.id !== id))
    } catch {}
  }

  async function copyToClipboard(text: string) {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-4 border-b border-wm-border bg-wm-surface px-8 py-4">
        <h1 className="text-lg font-semibold text-wm-text-primary">API Keys</h1>
        <span className="font-mono text-xs text-wm-text-muted">Manage API keys for the transactional email API</span>
        <div className="flex-1" />
        <Button variant="primary" size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setShowCreate(true)}>
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

        {/* New key display */}
        {newKeyFull && (
          <div className="mb-6 border border-wm-accent bg-wm-accent/10 p-4">
            <p className="mb-2 text-xs font-medium text-wm-accent">Your new API key (copy it now — it won't be shown again):</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 font-mono text-sm text-wm-text-primary break-all">{newKeyFull}</code>
              <button onClick={() => copyToClipboard(newKeyFull)} className="cursor-pointer text-wm-accent hover:text-wm-accent-hover">
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
            <button onClick={() => setNewKeyFull('')} className="mt-2 cursor-pointer font-mono text-[10px] text-wm-text-muted hover:text-wm-text-secondary">
              Dismiss
            </button>
          </div>
        )}

        {/* Create form */}
        {showCreate && !newKeyFull && (
          <div className="mb-6 border border-wm-border bg-wm-surface p-4">
            <h3 className="mb-3 text-sm font-semibold text-wm-text-primary">Create API Key</h3>
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <InputField label="Key name" value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)} placeholder="Production" error={error} />
              </div>
              <Button variant="primary" size="sm" loading={creating} onClick={handleCreate}>Create</Button>
              <Button variant="secondary" size="sm" onClick={() => { setShowCreate(false); setError('') }}>Cancel</Button>
            </div>
          </div>
        )}

        {/* Keys table */}
        <div className="border border-wm-border">
          <div className="flex items-center border-b border-wm-border bg-wm-surface px-4 py-2">
            <span className="w-[200px] font-mono text-[10px] font-semibold tracking-wider text-wm-text-muted">NAME</span>
            <span className="w-[200px] font-mono text-[10px] font-semibold tracking-wider text-wm-text-muted">KEY</span>
            <span className="w-[180px] font-mono text-[10px] font-semibold tracking-wider text-wm-text-muted">SCOPES</span>
            <span className="flex-1 font-mono text-[10px] font-semibold tracking-wider text-wm-text-muted">LAST USED</span>
            <span className="w-[80px]" />
          </div>

          {keys.map((key) => (
            <div key={key.id} className="flex items-center border-b border-wm-border px-4 py-3 last:border-b-0 hover:bg-wm-surface-hover transition-colors">
              <span className="w-[200px] text-sm text-wm-text-primary">{key.name}</span>
              <code className="w-[200px] font-mono text-xs text-wm-text-secondary">{key.keyPrefix}...████</code>
              <div className="w-[180px] flex flex-wrap gap-1">
                {(key.scopes as string[]).map((scope) => (
                  <Badge key={scope} variant="default" size="sm">{scope}</Badge>
                ))}
              </div>
              <span className="flex-1 font-mono text-xs text-wm-text-muted">
                {key.lastUsedAt ? formatRelativeTime(new Date(key.lastUsedAt)) : 'Never'}
              </span>
              <div className="w-[80px] flex justify-end gap-2">
                <button onClick={() => handleDelete(key.id)} className="cursor-pointer text-wm-text-muted hover:text-wm-error">
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
  )
}
