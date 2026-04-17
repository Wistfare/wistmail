'use client'

import { useState, useEffect, useCallback } from 'react'
import { Globe, Plus, RefreshCw, Copy, Check, X, Trash2, AlertTriangle, Cloud, Terminal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { InputField } from '@/components/ui/input-field'
import { Badge } from '@/components/ui/badge'
import { api } from '@/lib/api-client'
import { cn } from '@/lib/utils'

type Domain = {
  id: string
  name: string
  status: string
  verified: boolean
  mxVerified: boolean
  spfVerified: boolean
  dkimVerified: boolean
  dmarcVerified: boolean
  records?: Array<{ type: string; name: string; value: string; priority?: number; verified: boolean }>
}

type WizardStep = 'enter-name' | 'choose-method' | 'cloudflare-token' | 'manual-records' | 'verify' | 'done'
type PanelMode = 'none' | 'add-wizard' | 'detail' | 'delete'

export default function DomainsSettingsPage() {
  const [domains, setDomains] = useState<Domain[]>([])
  const [panelMode, setPanelMode] = useState<PanelMode>('none')
  const [selected, setSelected] = useState<Domain | null>(null)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  // Wizard state
  const [wizardStep, setWizardStep] = useState<WizardStep>('enter-name')
  const [newDomain, setNewDomain] = useState('')
  const [addedDomain, setAddedDomain] = useState<Domain | null>(null)
  const [cfToken, setCfToken] = useState('')
  const [wizardLoading, setWizardLoading] = useState(false)
  const [wizardError, setWizardError] = useState('')

  // Delete
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [deleting, setDeleting] = useState(false)

  const fetchDomains = useCallback(async () => {
    try {
      const res = await api.get<{ data: Domain[] }>('/api/v1/setup/domains')
      setDomains(res.data)
    } catch {}
  }, [])

  useEffect(() => { fetchDomains() }, [fetchDomains])

  function openAdd() {
    setNewDomain('')
    setAddedDomain(null)
    setCfToken('')
    setWizardError('')
    setWizardStep('enter-name')
    setPanelMode('add-wizard')
  }

  async function openDetail(id: string) {
    try {
      const result = await api.get<Domain>(`/api/v1/setup/domain/${id}`)
      setSelected(result)
      setPanelMode('detail')
    } catch {}
  }

  async function submitDomainName() {
    if (!newDomain.trim()) { setWizardError('Domain is required'); return }
    setWizardLoading(true)
    setWizardError('')
    try {
      const result = await api.post<Domain>('/api/v1/setup/domain', { name: newDomain.trim() })
      setAddedDomain(result)
      setWizardStep('choose-method')
      await fetchDomains()
    } catch (err: unknown) {
      setWizardError(err instanceof Error ? err.message : 'Failed to add domain')
    } finally {
      setWizardLoading(false)
    }
  }

  async function submitCloudflareToken() {
    if (!cfToken.trim() || !addedDomain) return
    setWizardLoading(true)
    setWizardError('')
    try {
      await api.post('/api/v1/setup/cloudflare/connect', { apiToken: cfToken.trim() })
      await api.post('/api/v1/setup/cloudflare/create-records', { apiToken: cfToken.trim() })
      setWizardStep('verify')
    } catch (err: unknown) {
      setWizardError(err instanceof Error ? err.message : 'Failed to configure via Cloudflare')
    } finally {
      setWizardLoading(false)
    }
  }

  async function verifyNow() {
    if (!addedDomain) return
    setWizardLoading(true)
    try {
      await api.post(`/api/v1/setup/domain/${addedDomain.id}/verify`)
      const refreshed = await api.get<Domain>(`/api/v1/setup/domain/${addedDomain.id}`)
      setAddedDomain(refreshed)
      await fetchDomains()
      if (refreshed.verified) setWizardStep('done')
    } catch (err: unknown) {
      setWizardError(err instanceof Error ? err.message : 'Verification failed')
    } finally {
      setWizardLoading(false)
    }
  }

  async function verifyDomain(domainId: string) {
    try {
      await api.post(`/api/v1/setup/domain/${domainId}/verify`)
      await fetchDomains()
      if (selected?.id === domainId) {
        const refreshed = await api.get<Domain>(`/api/v1/setup/domain/${domainId}`)
        setSelected(refreshed)
      }
    } catch {}
  }

  async function handleDelete() {
    if (!selected || deleteConfirm !== selected.name) return
    setDeleting(true)
    try {
      await api.delete(`/api/v1/setup/domain/${selected.id}`)
      await fetchDomains()
      setSelected(null)
      setPanelMode('none')
    } catch {} finally {
      setDeleting(false)
    }
  }

  async function copy(text: string, key: string) {
    await navigator.clipboard.writeText(text)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 2000)
  }

  return (
    <div className="flex h-full">
      <div className="flex flex-1 flex-col overflow-y-auto">
        {/* Consistent page header pattern */}
        <div className="flex items-center gap-3 px-8 py-6">
          <h1 className="text-2xl font-semibold text-wm-text-primary">Domains</h1>
          <div className="flex-1" />
          <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={openAdd}>
            Add Domain
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-8 pb-8">
          {domains.length === 0 ? (
            <div className="flex flex-col items-center gap-4 py-20 text-center border border-wm-border">
              <Globe className="h-10 w-10 text-wm-text-muted" />
              <p className="font-mono text-sm text-wm-text-tertiary">No domains configured yet.</p>
              <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={openAdd}>
                Add your first domain
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {domains.map((domain) => (
                <button
                  key={domain.id}
                  onClick={() => openDetail(domain.id)}
                  className="flex w-full cursor-pointer items-center gap-4 border border-wm-border bg-wm-surface px-5 py-4 text-left hover:bg-wm-surface-hover transition-colors"
                >
                  <Globe className="h-4 w-4 text-wm-text-muted" />
                  <span className="font-mono text-sm text-wm-text-primary">{domain.name}</span>
                  <Badge variant={domain.verified ? 'accent' : 'warning'} size="sm">
                    {domain.verified ? 'Verified' : domain.status}
                  </Badge>
                  <div className="flex-1" />
                  <div className="flex gap-2 font-mono text-[10px]">
                    <span className={domain.mxVerified ? 'text-wm-accent' : 'text-wm-text-muted'}>MX</span>
                    <span className={domain.spfVerified ? 'text-wm-accent' : 'text-wm-text-muted'}>SPF</span>
                    <span className={domain.dkimVerified ? 'text-wm-accent' : 'text-wm-text-muted'}>DKIM</span>
                    <span className={domain.dmarcVerified ? 'text-wm-accent' : 'text-wm-text-muted'}>DMARC</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right-side panel */}
      {panelMode !== 'none' && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setPanelMode('none')} />
          <div className="fixed right-0 top-0 z-50 flex h-full w-[440px] flex-col border-l border-wm-border bg-wm-surface shadow-2xl">
            {/* ── ADD WIZARD ── */}
            {panelMode === 'add-wizard' && (
              <>
                <div className="flex items-center justify-between border-b border-wm-border px-6 py-4">
                  <h2 className="text-base font-semibold text-wm-text-primary">Add Domain</h2>
                  <button onClick={() => setPanelMode('none')} className="cursor-pointer text-wm-text-muted hover:text-wm-text-secondary">
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Progress */}
                <div className="flex items-center gap-2 border-b border-wm-border px-6 py-3">
                  {(['enter-name', 'choose-method', 'verify', 'done'] as const).map((step, i) => {
                    const order = ['enter-name', 'choose-method', 'verify', 'done']
                    const currentIdx = order.indexOf(wizardStep === 'cloudflare-token' || wizardStep === 'manual-records' ? 'choose-method' : wizardStep)
                    const stepIdx = order.indexOf(step)
                    const isDone = stepIdx < currentIdx
                    const isActive = stepIdx === currentIdx
                    return (
                      <div key={step} className="flex items-center gap-2">
                        <div className={cn(
                          'h-1.5 w-6',
                          isDone ? 'bg-wm-accent' : isActive ? 'bg-wm-accent/50' : 'bg-wm-border',
                        )} />
                        {i < 3 && <div className="h-px w-2 bg-wm-border" />}
                      </div>
                    )
                  })}
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-5">
                  {/* Step 1: Enter name */}
                  {wizardStep === 'enter-name' && (
                    <div className="flex flex-col gap-4">
                      <div>
                        <p className="text-sm font-medium text-wm-text-primary mb-1">Domain name</p>
                        <p className="font-mono text-[11px] text-wm-text-muted">The domain you want to send email from (e.g., yourcompany.com).</p>
                      </div>
                      <InputField
                        placeholder="example.com"
                        value={newDomain}
                        onChange={(e) => setNewDomain(e.target.value)}
                        error={wizardError}
                      />
                    </div>
                  )}

                  {/* Step 2: Choose method */}
                  {wizardStep === 'choose-method' && (
                    <div className="flex flex-col gap-4">
                      <div>
                        <p className="text-sm font-medium text-wm-text-primary mb-1">How do you manage DNS for <span className="font-mono text-wm-accent">{addedDomain?.name}</span>?</p>
                        <p className="font-mono text-[11px] text-wm-text-muted">We need to publish 4 DNS records (MX, SPF, DKIM, DMARC).</p>
                      </div>

                      <button
                        onClick={() => { setWizardStep('cloudflare-token') }}
                        className="flex items-start gap-3 border border-wm-border bg-wm-bg p-4 text-left hover:border-wm-accent transition-colors"
                      >
                        <Cloud className="mt-0.5 h-5 w-5 text-wm-accent" />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-wm-text-primary">Cloudflare (recommended)</p>
                          <p className="mt-1 font-mono text-[10px] text-wm-text-muted">One-click setup via Cloudflare API token — records created automatically.</p>
                        </div>
                      </button>

                      <button
                        onClick={() => { setWizardStep('manual-records') }}
                        className="flex items-start gap-3 border border-wm-border bg-wm-bg p-4 text-left hover:border-wm-accent transition-colors"
                      >
                        <Terminal className="mt-0.5 h-5 w-5 text-wm-text-secondary" />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-wm-text-primary">Manual DNS</p>
                          <p className="mt-1 font-mono text-[10px] text-wm-text-muted">Copy the records and add them in your DNS provider's dashboard.</p>
                        </div>
                      </button>
                    </div>
                  )}

                  {/* Step 2a: Cloudflare token */}
                  {wizardStep === 'cloudflare-token' && (
                    <div className="flex flex-col gap-4">
                      <div className="flex items-start gap-3 border border-wm-border bg-wm-bg p-3">
                        <Cloud className="mt-0.5 h-4 w-4 text-wm-accent" />
                        <div className="font-mono text-[11px] leading-relaxed text-wm-text-secondary">
                          Create a scoped API token in your Cloudflare dashboard with <code className="text-wm-accent">Zone:Edit</code> and <code className="text-wm-accent">DNS:Edit</code> permissions for <code>{addedDomain?.name}</code>.
                        </div>
                      </div>
                      <InputField
                        label="Cloudflare API Token"
                        placeholder="••••••••••••••••••"
                        value={cfToken}
                        onChange={(e) => setCfToken(e.target.value)}
                        error={wizardError}
                      />
                      <button
                        onClick={() => setWizardStep('choose-method')}
                        className="self-start font-mono text-[11px] text-wm-text-muted hover:text-wm-text-secondary cursor-pointer"
                      >
                        ← Choose a different method
                      </button>
                    </div>
                  )}

                  {/* Step 2b: Manual records */}
                  {wizardStep === 'manual-records' && addedDomain && (
                    <div className="flex flex-col gap-4">
                      <p className="font-mono text-[11px] text-wm-text-secondary">
                        Add these records in your DNS provider, then click <strong>Verify</strong>.
                      </p>
                      <div className="border border-wm-border">
                        <div className="flex bg-wm-bg px-3 py-2 font-mono text-[10px] font-semibold text-wm-text-muted">
                          <span className="w-12">TYPE</span>
                          <span className="w-32">NAME</span>
                          <span className="flex-1">VALUE</span>
                        </div>
                        {addedDomain.records?.map((rec, i) => (
                          <div key={i} className="flex items-start gap-2 border-t border-wm-border px-3 py-2">
                            <span className="w-12 shrink-0 font-mono text-[10px] font-medium text-wm-warning">{rec.type}</span>
                            <span className="w-32 shrink-0 truncate font-mono text-[10px] text-wm-text-secondary">{rec.name}</span>
                            <span className="flex-1 break-all font-mono text-[10px] text-wm-text-secondary">{rec.value}</span>
                            <button onClick={() => copy(rec.value, `w-${i}`)} className="shrink-0 cursor-pointer text-wm-text-muted hover:text-wm-text-secondary">
                              {copiedKey === `w-${i}` ? <Check className="h-3 w-3 text-wm-accent" /> : <Copy className="h-3 w-3" />}
                            </button>
                          </div>
                        ))}
                      </div>
                      <button
                        onClick={() => setWizardStep('choose-method')}
                        className="self-start font-mono text-[11px] text-wm-text-muted hover:text-wm-text-secondary cursor-pointer"
                      >
                        ← Choose a different method
                      </button>
                    </div>
                  )}

                  {/* Step 3: Verify */}
                  {wizardStep === 'verify' && addedDomain && (
                    <div className="flex flex-col gap-4">
                      <p className="text-sm font-medium text-wm-text-primary">Verify DNS records</p>
                      <p className="font-mono text-[11px] text-wm-text-muted">DNS propagation can take a few minutes.</p>

                      <div className="flex flex-col gap-2">
                        {(['mx', 'spf', 'dkim', 'dmarc'] as const).map((r) => {
                          const key = `${r}Verified` as keyof Domain
                          const verified = addedDomain[key] as boolean
                          return (
                            <div key={r} className="flex items-center gap-2 border border-wm-border bg-wm-bg px-3 py-2">
                              {verified ? <Check className="h-3.5 w-3.5 text-wm-accent" /> : <div className="h-2 w-2 rounded-full bg-wm-text-muted" />}
                              <span className="font-mono text-xs text-wm-text-primary uppercase">{r}</span>
                              <div className="flex-1" />
                              <Badge variant={verified ? 'accent' : 'default'} size="sm">
                                {verified ? 'Verified' : 'Pending'}
                              </Badge>
                            </div>
                          )
                        })}
                      </div>

                      {wizardError && <p className="font-mono text-[10px] text-wm-error">{wizardError}</p>}
                    </div>
                  )}

                  {/* Step 4: Done */}
                  {wizardStep === 'done' && addedDomain && (
                    <div className="flex flex-col items-center gap-4 py-8 text-center">
                      <div className="flex h-12 w-12 items-center justify-center bg-wm-accent">
                        <Check className="h-6 w-6 text-wm-text-on-accent" />
                      </div>
                      <p className="text-base font-semibold text-wm-text-primary">{addedDomain.name} is verified</p>
                      <p className="font-mono text-[11px] text-wm-text-muted">You can now send email from this domain.</p>
                    </div>
                  )}
                </div>

                {/* Wizard footer */}
                <div className="flex gap-3 border-t border-wm-border px-6 py-4">
                  {wizardStep === 'enter-name' && (
                    <>
                      <Button variant="secondary" size="sm" onClick={() => setPanelMode('none')} className="flex-1">Cancel</Button>
                      <Button variant="primary" size="sm" loading={wizardLoading} onClick={submitDomainName} className="flex-1">Continue</Button>
                    </>
                  )}
                  {wizardStep === 'choose-method' && (
                    <Button variant="secondary" size="sm" onClick={() => setPanelMode('none')} className="w-full">Cancel</Button>
                  )}
                  {wizardStep === 'cloudflare-token' && (
                    <>
                      <Button variant="secondary" size="sm" onClick={() => setWizardStep('choose-method')} className="flex-1">Back</Button>
                      <Button variant="primary" size="sm" loading={wizardLoading} onClick={submitCloudflareToken} className="flex-1">
                        Create Records
                      </Button>
                    </>
                  )}
                  {wizardStep === 'manual-records' && (
                    <>
                      <Button variant="secondary" size="sm" onClick={() => setWizardStep('choose-method')} className="flex-1">Back</Button>
                      <Button variant="primary" size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />} loading={wizardLoading} onClick={() => { setWizardStep('verify'); verifyNow() }} className="flex-1">
                        Verify
                      </Button>
                    </>
                  )}
                  {wizardStep === 'verify' && (
                    <Button variant="primary" size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />} loading={wizardLoading} onClick={verifyNow} className="w-full">
                      Verify Now
                    </Button>
                  )}
                  {wizardStep === 'done' && (
                    <Button variant="primary" size="sm" onClick={() => setPanelMode('none')} className="w-full">Done</Button>
                  )}
                </div>
              </>
            )}

            {/* ── DETAIL ── */}
            {panelMode === 'detail' && selected && (
              <>
                <div className="flex items-center justify-between border-b border-wm-border px-6 py-4">
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4 text-wm-text-muted" />
                    <h2 className="text-base font-semibold text-wm-text-primary">{selected.name}</h2>
                  </div>
                  <button onClick={() => setPanelMode('none')} className="cursor-pointer text-wm-text-muted hover:text-wm-text-secondary">
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-5">
                  <div className="flex flex-col gap-5">
                    <div className="flex items-center gap-2">
                      <Badge variant={selected.verified ? 'accent' : 'warning'} size="sm">
                        {selected.verified ? 'Verified' : selected.status}
                      </Badge>
                      <div className="flex-1" />
                      <Button variant="secondary" size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={() => verifyDomain(selected.id)}>
                        Re-verify
                      </Button>
                    </div>

                    <div className="flex flex-col gap-2">
                      {(['mx', 'spf', 'dkim', 'dmarc'] as const).map((r) => {
                        const verified = selected[`${r}Verified` as keyof Domain] as boolean
                        return (
                          <div key={r} className="flex items-center gap-2 border border-wm-border bg-wm-bg px-3 py-2">
                            {verified ? <Check className="h-3.5 w-3.5 text-wm-accent" /> : <div className="h-2 w-2 rounded-full bg-wm-text-muted" />}
                            <span className="font-mono text-xs text-wm-text-primary uppercase">{r}</span>
                            <div className="flex-1" />
                            <Badge variant={verified ? 'accent' : 'default'} size="sm">{verified ? 'OK' : 'Pending'}</Badge>
                          </div>
                        )
                      })}
                    </div>

                    {selected.records && (
                      <div>
                        <label className="mb-2 block font-mono text-[10px] font-semibold tracking-wider text-wm-text-muted">DNS RECORDS</label>
                        <div className="border border-wm-border">
                          {selected.records.map((rec, i) => (
                            <div key={i} className="flex items-start gap-2 border-b border-wm-border px-3 py-2 last:border-b-0">
                              <span className="w-12 shrink-0 font-mono text-[10px] font-medium text-wm-warning">{rec.type}</span>
                              <div className="flex-1 min-w-0">
                                <p className="truncate font-mono text-[10px] text-wm-text-secondary">{rec.name}</p>
                                <p className="break-all font-mono text-[10px] text-wm-text-muted">{rec.value}</p>
                              </div>
                              <button onClick={() => copy(rec.value, `d-${i}`)} className="shrink-0 cursor-pointer text-wm-text-muted hover:text-wm-text-secondary">
                                {copiedKey === `d-${i}` ? <Check className="h-3 w-3 text-wm-accent" /> : <Copy className="h-3 w-3" />}
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="border-t border-wm-border px-6 py-4">
                  <Button variant="danger" size="sm" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => { setDeleteConfirm(''); setPanelMode('delete') }} className="w-full">
                    Remove Domain
                  </Button>
                </div>
              </>
            )}

            {/* ── DELETE CONFIRM ── */}
            {panelMode === 'delete' && selected && (
              <>
                <div className="flex items-center justify-between border-b border-wm-border px-6 py-4">
                  <h2 className="text-base font-semibold text-wm-error">Remove Domain</h2>
                  <button onClick={() => setPanelMode('detail')} className="cursor-pointer text-wm-text-muted hover:text-wm-text-secondary">
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-5">
                  <div className="flex flex-col gap-5">
                    <div className="flex items-start gap-3 border border-wm-error/30 bg-wm-error/5 p-3">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-wm-error" />
                      <div>
                        <p className="text-xs font-medium text-wm-error">This cannot be undone</p>
                        <p className="mt-1 font-mono text-[10px] leading-relaxed text-wm-text-secondary">
                          All mailboxes under this domain will be deleted and email delivery will stop immediately.
                        </p>
                      </div>
                    </div>
                    <InputField
                      label={`Type "${selected.name}" to confirm`}
                      value={deleteConfirm}
                      onChange={(e) => setDeleteConfirm(e.target.value)}
                      placeholder={selected.name}
                    />
                  </div>
                </div>

                <div className="flex gap-3 border-t border-wm-border px-6 py-4">
                  <Button variant="secondary" size="sm" onClick={() => setPanelMode('detail')} className="flex-1">Cancel</Button>
                  <Button variant="danger" size="sm" loading={deleting} onClick={handleDelete} disabled={deleteConfirm !== selected.name} className="flex-1">
                    Remove Domain
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
