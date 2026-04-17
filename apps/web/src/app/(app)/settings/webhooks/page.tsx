'use client'

import { useState, useEffect } from 'react'
import { Webhook, Plus, Trash2, Copy, Check, X, AlertTriangle } from 'lucide-react'
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

type PanelMode = 'none' | 'create' | 'detail' | 'delete'

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
  const [panelMode, setPanelMode] = useState<PanelMode>('none')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState('')

  // create form
  const [newUrl, setNewUrl] = useState('')
  const [newEvents, setNewEvents] = useState<string[]>(['email.sent', 'email.delivered', 'email.bounced'])
  const [creating, setCreating] = useState(false)

  // selected / delete
  const [selected, setSelected] = useState<WebhookData | null>(null)
  const [logs, setLogs] = useState<WebhookLog[]>([])
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    api.get<{ data: WebhookData[] }>('/api/v1/webhooks').then((res) => setWebhooksList(res.data)).catch(() => {})
  }, [])

  function openCreate() {
    setNewUrl('')
    setNewEvents(['email.sent', 'email.delivered', 'email.bounced'])
    setError('')
    setPanelMode('create')
  }

  async function openDetail(wh: WebhookData) {
    setSelected(wh)
    setPanelMode('detail')
    try {
      const res = await api.get<{ webhook: WebhookData; logs: WebhookLog[] }>(`/api/v1/webhooks/${wh.id}`)
      setLogs(res.logs)
    } catch { setLogs([]) }
  }

  function openDelete() {
    if (!selected) return
    setDeleteConfirm('')
    setPanelMode('delete')
  }

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
      openDetail(result)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create')
    } finally {
      setCreating(false)
    }
  }

  async function handleDelete() {
    if (!selected || deleteConfirm !== 'delete') return
    setDeleting(true)
    try {
      await api.delete(`/api/v1/webhooks/${selected.id}`)
      setWebhooksList((prev) => prev.filter((w) => w.id !== selected.id))
      setSelected(null)
      setPanelMode('none')
    } catch {} finally {
      setDeleting(false)
    }
  }

  async function handleToggle(wh: WebhookData) {
    try {
      await api.patch(`/api/v1/webhooks/${wh.id}`, { active: !wh.active })
      setWebhooksList((prev) => prev.map((w) => w.id === wh.id ? { ...w, active: !w.active } : w))
      if (selected?.id === wh.id) setSelected({ ...wh, active: !wh.active })
    } catch {}
  }

  function toggleEvent(evt: string) {
    setNewEvents((prev) => prev.includes(evt) ? prev.filter((e) => e !== evt) : [...prev, evt])
  }

  async function copyToClipboard(text: string, key: string) {
    await navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(''), 2000)
  }

  return (
    <div className="flex h-full">
      <div className="flex flex-1 flex-col overflow-y-auto">
        {/* Consistent page header pattern */}
        <div className="flex items-center gap-3 px-8 py-6">
          <h1 className="text-2xl font-semibold text-wm-text-primary">Webhooks</h1>
          <div className="flex-1" />
          <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={openCreate}>
            Add Endpoint
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-8 pb-8">
          <div className="border border-wm-border">
            <div className="flex items-center border-b border-wm-border bg-wm-surface px-4 py-2">
              <span className="w-[50px]" />
              <span className="flex-1 font-mono text-[10px] font-semibold tracking-wider text-wm-text-muted">ENDPOINT URL</span>
              <span className="w-[280px] font-mono text-[10px] font-semibold tracking-wider text-wm-text-muted">EVENTS</span>
              <span className="w-[100px] font-mono text-[10px] font-semibold tracking-wider text-wm-text-muted">STATUS</span>
            </div>

            {webhooksList.map((wh) => (
              <button
                key={wh.id}
                onClick={() => openDetail(wh)}
                className="flex w-full cursor-pointer items-center border-b border-wm-border px-4 py-3 text-left last:border-b-0 hover:bg-wm-surface-hover transition-colors"
              >
                <div className="w-[50px]">
                  <Webhook className="h-4 w-4 text-wm-text-muted" />
                </div>
                <code className="flex-1 truncate font-mono text-xs text-wm-text-primary">{wh.url}</code>
                <div className="w-[280px] flex flex-wrap gap-1">
                  {(wh.events as string[]).slice(0, 2).map((evt) => (
                    <Badge key={evt} variant="default" size="sm">{evt}</Badge>
                  ))}
                  {(wh.events as string[]).length > 2 && (
                    <Badge variant="default" size="sm">+{(wh.events as string[]).length - 2}</Badge>
                  )}
                </div>
                <div className="w-[100px]">
                  <Badge variant={wh.active ? 'accent' : 'default'} size="sm">
                    {wh.active ? 'Active' : 'Paused'}
                  </Badge>
                </div>
              </button>
            ))}

            {webhooksList.length === 0 && (
              <div className="flex flex-col items-center gap-3 py-12 text-center">
                <Webhook className="h-8 w-8 text-wm-text-muted" />
                <p className="font-mono text-sm text-wm-text-tertiary">No webhook endpoints configured.</p>
                <p className="font-mono text-[11px] text-wm-text-muted">Add one to receive real-time event notifications.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Right Side Panel ── */}
      {panelMode !== 'none' && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setPanelMode('none')} />
          <div className="fixed right-0 top-0 z-50 flex h-full w-[400px] flex-col border-l border-wm-border bg-wm-surface shadow-2xl">
            {/* CREATE */}
            {panelMode === 'create' && (
              <>
                <div className="flex items-center justify-between border-b border-wm-border px-6 py-4">
                  <h2 className="text-base font-semibold text-wm-text-primary">New Webhook Endpoint</h2>
                  <button onClick={() => setPanelMode('none')} className="cursor-pointer text-wm-text-muted hover:text-wm-text-secondary">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto px-6 py-5">
                  <div className="flex flex-col gap-4">
                    <InputField
                      label="Endpoint URL"
                      value={newUrl}
                      onChange={(e) => setNewUrl(e.target.value)}
                      placeholder="https://api.yourapp.com/webhooks/wistfare"
                      hint="Must be a publicly-accessible HTTPS endpoint"
                      error={error}
                    />
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
                      <p className="mt-2 font-mono text-[10px] text-wm-text-muted">
                        A signing secret will be generated. Use it to verify webhook signatures.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex gap-3 border-t border-wm-border px-6 py-4">
                  <Button variant="secondary" size="sm" onClick={() => setPanelMode('none')} className="flex-1">Cancel</Button>
                  <Button variant="primary" size="sm" loading={creating} onClick={handleCreate} className="flex-1">Create Endpoint</Button>
                </div>
              </>
            )}

            {/* DETAIL */}
            {panelMode === 'detail' && selected && (
              <>
                <div className="flex items-center justify-between border-b border-wm-border px-6 py-4">
                  <div className="flex items-center gap-2">
                    <Webhook className="h-4 w-4 text-wm-text-muted" />
                    <h2 className="text-base font-semibold text-wm-text-primary">Webhook Details</h2>
                  </div>
                  <button onClick={() => setPanelMode('none')} className="cursor-pointer text-wm-text-muted hover:text-wm-text-secondary">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto px-6 py-5">
                  <div className="flex flex-col gap-5">
                    {/* URL + active toggle */}
                    <div>
                      <label className="mb-1 block font-mono text-[10px] font-semibold tracking-wider text-wm-text-muted">ENDPOINT URL</label>
                      <code className="block font-mono text-xs text-wm-text-primary break-all">{selected.url}</code>
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-wm-text-primary">{selected.active ? 'Active' : 'Paused'}</p>
                        <p className="font-mono text-[10px] text-wm-text-muted">
                          {selected.active ? 'Receiving events' : 'Event delivery is paused'}
                        </p>
                      </div>
                      <button
                        onClick={() => handleToggle(selected)}
                        className={cn('relative h-6 w-11 rounded-full transition-colors', selected.active ? 'bg-wm-accent' : 'bg-wm-text-muted')}
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
                        <code className="flex-1 font-mono text-xs text-wm-text-secondary break-all">
                          {selected.secret.slice(0, 12)}...{selected.secret.slice(-6)}
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
                          <div key={log.id} className="flex items-center gap-2 border-b border-wm-border px-3 py-2 last:border-b-0">
                            <Badge variant={log.responseStatus >= 200 && log.responseStatus < 300 ? 'accent' : 'error'} size="sm">
                              {log.responseStatus || 'ERR'}
                            </Badge>
                            <span className="flex-1 font-mono text-[11px] text-wm-text-secondary">{log.event}</span>
                            <span className="font-mono text-[10px] text-wm-text-muted">{formatRelativeTime(new Date(log.createdAt))}</span>
                          </div>
                        ))}
                        {logs.length === 0 && (
                          <div className="py-6 text-center">
                            <p className="font-mono text-[11px] text-wm-text-muted">No deliveries yet</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="border-t border-wm-border px-6 py-4">
                  <Button variant="danger" size="sm" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={openDelete} className="w-full">
                    Delete Endpoint
                  </Button>
                </div>
              </>
            )}

            {/* DELETE CONFIRMATION */}
            {panelMode === 'delete' && selected && (
              <>
                <div className="flex items-center justify-between border-b border-wm-border px-6 py-4">
                  <h2 className="text-base font-semibold text-wm-error">Delete Endpoint</h2>
                  <button onClick={() => setPanelMode('detail')} className="cursor-pointer text-wm-text-muted hover:text-wm-text-secondary">
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
                          All future events for this endpoint will stop being delivered. Delivery logs will be erased.
                        </p>
                      </div>
                    </div>
                    <div>
                      <label className="mb-1 block font-mono text-[10px] font-semibold tracking-wider text-wm-text-muted">ENDPOINT TO DELETE</label>
                      <code className="block font-mono text-xs text-wm-text-primary break-all">{selected.url}</code>
                    </div>
                    <InputField
                      label="Type 'delete' to confirm"
                      value={deleteConfirm}
                      onChange={(e) => setDeleteConfirm(e.target.value)}
                      placeholder="delete"
                    />
                  </div>
                </div>
                <div className="flex gap-3 border-t border-wm-border px-6 py-4">
                  <Button variant="secondary" size="sm" onClick={() => setPanelMode('detail')} className="flex-1">Cancel</Button>
                  <Button
                    variant="danger"
                    size="sm"
                    icon={<Trash2 className="h-3.5 w-3.5" />}
                    loading={deleting}
                    onClick={handleDelete}
                    disabled={deleteConfirm !== 'delete'}
                    className="flex-1"
                  >
                    Delete
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
