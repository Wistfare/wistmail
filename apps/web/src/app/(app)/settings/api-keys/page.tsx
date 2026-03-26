'use client'

import { useState } from 'react'
import { Key, Plus, Copy, Check, Trash2, Shield } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { InputField } from '@/components/ui/input-field'
import { SettingsCard } from '@/components/ui/settings-card'
import { Badge } from '@/components/ui/badge'

export default function ApiKeysPage() {
  const [showCreate, setShowCreate] = useState(false)
  const [keyName, setKeyName] = useState('')
  const [createdKey, setCreatedKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // Mock data — will connect to API
  const keys = [
    { id: '1', name: 'Production', prefix: 'wm_live_a3f8', scopes: ['send', 'read'], lastUsed: '2 hours ago', created: 'Mar 1, 2026' },
    { id: '2', name: 'Development', prefix: 'wm_test_7d2e', scopes: ['all'], lastUsed: '5 days ago', created: 'Mar 10, 2026' },
  ]

  async function copyKey() {
    if (createdKey) {
      await navigator.clipboard.writeText(createdKey)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold text-wm-text-primary">API Keys</h1>
        <div className="flex-1" />
        <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setShowCreate(true)}>
          Create Key
        </Button>
      </div>

      <div className="flex items-center gap-3 border border-wm-accent bg-wm-accent/5 p-4">
        <Shield className="h-4 w-4 shrink-0 text-wm-accent" />
        <p className="font-mono text-xs text-wm-text-secondary">
          API keys grant programmatic access to send emails. Keep them secure and never share in public repositories.
        </p>
      </div>

      {createdKey && (
        <div className="border border-wm-accent bg-wm-accent/5 p-4">
          <p className="mb-2 font-mono text-xs font-semibold text-wm-accent">New API key created — copy it now, it won&apos;t be shown again:</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-wm-surface px-3 py-2 font-mono text-sm text-wm-text-primary">{createdKey}</code>
            <Button variant="secondary" size="sm" onClick={copyKey} icon={copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}>
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
        </div>
      )}

      {showCreate && (
        <SettingsCard title="Create API Key">
          <div className="flex flex-col gap-4">
            <InputField
              label="Key name"
              placeholder="e.g., Production"
              value={keyName}
              onChange={(e) => setKeyName(e.target.value)}
            />
            <div className="flex gap-3">
              <Button variant="primary" onClick={() => { setCreatedKey('wm_live_' + Math.random().toString(36).slice(2, 18)); setShowCreate(false) }}>
                Create
              </Button>
              <Button variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button>
            </div>
          </div>
        </SettingsCard>
      )}

      <div className="border border-wm-border">
        <div className="flex bg-wm-surface-hover px-4 py-2.5 font-mono text-[10px] font-semibold text-wm-text-muted">
          <span className="w-40">Name</span>
          <span className="flex-1">Key</span>
          <span className="w-28">Scopes</span>
          <span className="w-24">Last Used</span>
          <span className="w-16" />
        </div>
        {keys.map((key) => (
          <div key={key.id} className="flex items-center border-t border-wm-border px-4 py-3">
            <div className="w-40">
              <p className="text-sm font-medium text-wm-text-primary">{key.name}</p>
              <p className="font-mono text-[10px] text-wm-text-muted">Created {key.created}</p>
            </div>
            <span className="flex-1 font-mono text-xs text-wm-text-secondary">{key.prefix}...****</span>
            <div className="flex w-28 gap-1">
              {key.scopes.map((s) => (
                <Badge key={s} variant="accent" size="sm">{s}</Badge>
              ))}
            </div>
            <span className="w-24 font-mono text-xs text-wm-text-muted">{key.lastUsed}</span>
            <div className="flex w-16 justify-end gap-2">
              <button className="cursor-pointer text-wm-text-muted hover:text-wm-text-secondary">
                <Copy className="h-3.5 w-3.5" />
              </button>
              <button className="cursor-pointer text-wm-text-muted hover:text-wm-error">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
