'use client'

import { useState, useEffect } from 'react'
import { Webhook, Plus, Trash2, Copy, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { InputField } from '@/components/ui/input-field'
import { Badge } from '@/components/ui/badge'
import { api } from '@/lib/api-client'
import { formatRelativeTime } from '@/lib/utils'
import { cn } from '@/lib/utils'

type WebhookData = {
  id: string
  url: string
  events: string[]
  secret: string
  active: boolean
  createdAt: string
}

type WebhookLog = {
  id: string
  event: string
  responseStatus: number
  attempts: number
  createdAt: string
}

const ALL_EVENTS = [
  { id: 'email.sent', label: 'email.sent' },
  { id: 'email.delivered', label: 'email.delivered' },
  { id: 'email.bounced', label: 'email.bounced' },
  { id: 'email.opened', label: 'email.opened' },
  { id: 'email.failed', label: 'email.failed' },
  { id: 'email.received', label: 'email.received' },
]

export default function WebhooksPage() {
  const [webhooksList, setWebhooksList] = useState<WebhookData[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState('')

  // Create form
  const [newUrl, setNewUrl] = useState('')
  const [newEvents, setNewEvents] = useState<string[]>(['email.sent', 'email.delivered', 'email.bounced'])

  // Selected webhook detail
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [logs, setLogs] = useState<WebhookLog[]>([])

  useEffect(() => {
    api.get<{ data: WebhookData[] }>('/api/v1/webhooks').then((res) => {
      setWebhooksList(res.data)
    }).catch(() => {})
  }, [])

  async function handleCreate() {
    if (!newUrl.trim()) { setError('URL is required'); return }
    if (newEvents.length === 0) { setError('Select at least one event'); return }
    setCreating(true)
    setError('')
    try {
      const result = await api.post<WebhookData>('/api/v1/webhooks', {
        url: newUrl.trim(),
        events: newEvents,
      })
      setWebhooksList((prev) => [result, ...prev])
      setShowCreate(false)
      setNewUrl('')
      setSelectedId(result.id)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create')
    } finally {
      setCreating(false)
    }
  }

  async function handleDelete(id: string) {
    try {
      await api.delete(`/api/v1/webhooks/${id}`)
      setWebhooksList((prev) => prev.filter((w) => w.id !== id))
      if (selectedId === id) setSelectedId(null)
    } catch {}
  }

  async function handleToggle(wh: WebhookData) {
    try {
      await api.patch(`/api/v1/webhooks/${wh.id}`, { active: !wh.active })
      setWebhooksList((prev) => prev.map((w) => w.id === wh.id ? { ...w, active: !w.active } : w))
    } catch {}
  }

  async function selectWebhook(id: string) {
    setSelectedId(id)
    try {
      const res = await api.get<{ webhook: WebhookData; logs: WebhookLog[] }>(`/api/v1/webhooks/${id}`)
      setLogs(res.logs)
    } catch { setLogs([]) }
  }

  function toggleEvent(evt: string) {
    setNewEvents((prev) => prev.includes(evt) ? prev.filter((e) => e !== evt) : [...prev, evt])
  }

  async function copyToClipboard(text: string, key: string) {
    await navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(''), 2000)
  }

  const selected = webhooksList.find((w) => w.id === selectedId)

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-4 border-b border-wm-border bg-wm-surface px-8 py-4">
        <h1 className="text-lg font-semibold text-wm-text-primary">Webhooks</h1>
        <span className="font-mono text-xs text-wm-text-muted">Receive real-time notifications for email events</span>
        <div className="flex-1" />
        <Button variant="primary" size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setShowCreate(true)}>
          Add Endpoint
        </Button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Webhook list */}
        <div className="flex w-[400px] shrink-0 flex-col border-r border-wm-border overflow-y-auto">
          {/* Create form */}
          {showCreate && (
            <div className="border-b border-wm-border p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-wm-text-primary">New Endpoint</h3>
                <button onClick={() => setShowCreate(false)} className="cursor-pointer text-wm-text-muted"><X className="h-4 w-4" /></button>
              </div>
              <div className="flex flex-col gap-3">
                <InputField label="Endpoint URL" value={newUrl} onChange={(e) => setNewUrl(e.target.value)} placeholder="https://api.example.com/webhooks/wistmail" error={error} />
                <div>
                  <label className="mb-2 block font-mono text-[10px] font-semibold tracking-wider text-wm-text-muted">EVENTS</label>
                  <div className="flex flex-wrap gap-1.5">
                    {ALL_EVENTS.map((evt) => (
                      <button
                        key={evt.id}
                        onClick={() => toggleEvent(evt.id)}
                        className={cn(
                          'cursor-pointer px-2 py-1 font-mono text-[10px] border transition-colors',
                          newEvents.includes(evt.id)
                            ? 'border-wm-accent bg-wm-accent/10 text-wm-accent'
                            : 'border-wm-border text-wm-text-muted hover:border-wm-text-muted',
                        )}
                      >
                        {evt.label}
                      </button>
                    ))}
                  </div>
                </div>
                <Button variant="primary" size="sm" loading={creating} onClick={handleCreate}>Create Endpoint</Button>
              </div>
            </div>
          )}

          {/* List */}
          {webhooksList.map((wh) => (
            <button
              key={wh.id}
              onClick={() => selectWebhook(wh.id)}
              className={cn(
                'flex w-full cursor-pointer flex-col gap-1.5 border-b border-wm-border px-4 py-3 text-left transition-colors',
                selectedId === wh.id ? 'bg-wm-surface border-l-2 border-l-wm-accent' : 'hover:bg-wm-surface-hover',
              )}
            >
              <div className="flex items-center gap-2">
                <Webhook className="h-3.5 w-3.5 text-wm-text-muted" />
                <span className="flex-1 truncate font-mono text-xs text-wm-text-primary">{wh.url}</span>
                <div className={cn('h-2 w-2 rounded-full', wh.active ? 'bg-wm-accent' : 'bg-wm-text-muted')} />
              </div>
              <div className="flex flex-wrap gap-1">
                {(wh.events as string[]).slice(0, 3).map((evt) => (
                  <Badge key={evt} variant="default" size="sm">{evt}</Badge>
                ))}
                {(wh.events as string[]).length > 3 && (
                  <Badge variant="default" size="sm">+{(wh.events as string[]).length - 3}</Badge>
                )}
              </div>
            </button>
          ))}

          {webhooksList.length === 0 && !showCreate && (
            <div className="flex flex-col items-center gap-3 py-12 text-center px-4">
              <Webhook className="h-8 w-8 text-wm-text-muted" />
              <p className="font-mono text-sm text-wm-text-tertiary">No webhook endpoints configured.</p>
            </div>
          )}
        </div>

        {/* Webhook detail */}
        <div className="flex-1 overflow-y-auto p-8">
          {selected ? (
            <div className="flex flex-col gap-6">
              {/* URL + toggle */}
              <div className="flex items-center gap-3">
                <code className="flex-1 font-mono text-sm text-wm-text-primary">{selected.url}</code>
                <button
                  onClick={() => handleToggle(selected)}
                  className={cn(
                    'relative h-6 w-11 rounded-full transition-colors',
                    selected.active ? 'bg-wm-accent' : 'bg-wm-text-muted',
                  )}
                >
                  <div className={cn(
                    'absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform',
                    selected.active ? 'translate-x-[22px]' : 'translate-x-0.5',
                  )} />
                </button>
              </div>

              {/* Events */}
              <div>
                <label className="mb-2 block font-mono text-[10px] font-semibold tracking-wider text-wm-text-muted">SUBSCRIBED EVENTS</label>
                <div className="flex flex-wrap gap-1.5">
                  {(selected.events as string[]).map((evt) => (
                    <Badge key={evt} variant="accent" size="sm">{evt}</Badge>
                  ))}
                </div>
              </div>

              {/* Secret */}
              <div>
                <label className="mb-1 block font-mono text-[10px] font-semibold tracking-wider text-wm-text-muted">SIGNING SECRET</label>
                <div className="flex items-center gap-2 border border-wm-border bg-wm-bg px-3 py-2">
                  <code className="flex-1 font-mono text-xs text-wm-text-secondary">
                    {selected.secret.slice(0, 8)}...{selected.secret.slice(-4)}
                  </code>
                  <button onClick={() => copyToClipboard(selected.secret, 'secret')} className="cursor-pointer text-wm-text-muted hover:text-wm-text-secondary">
                    {copied === 'secret' ? <Check className="h-3.5 w-3.5 text-wm-accent" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>

              {/* Recent deliveries */}
              <div>
                <label className="mb-2 block font-mono text-[10px] font-semibold tracking-wider text-wm-text-muted">RECENT DELIVERIES</label>
                <div className="border border-wm-border">
                  {logs.map((log) => (
                    <div key={log.id} className="flex items-center gap-3 border-b border-wm-border px-4 py-2.5 last:border-b-0">
                      <div className={cn('h-2 w-2 rounded-full', log.responseStatus >= 200 && log.responseStatus < 300 ? 'bg-wm-accent' : 'bg-wm-error')} />
                      <Badge variant={log.responseStatus >= 200 && log.responseStatus < 300 ? 'accent' : 'error'} size="sm">
                        {log.responseStatus || 'ERR'}
                      </Badge>
                      <span className="font-mono text-xs text-wm-text-secondary">{log.event}</span>
                      <div className="flex-1" />
                      <span className="font-mono text-[10px] text-wm-text-muted">{formatRelativeTime(new Date(log.createdAt))}</span>
                    </div>
                  ))}
                  {logs.length === 0 && (
                    <div className="py-8 text-center">
                      <p className="font-mono text-xs text-wm-text-muted">No deliveries yet</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Delete */}
              <div className="border-t border-wm-border pt-4">
                <Button variant="danger" size="sm" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => handleDelete(selected.id)}>
                  Delete Endpoint
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3">
              <Webhook className="h-10 w-10 text-wm-text-muted" />
              <p className="text-sm text-wm-text-muted">Select a webhook to view details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
