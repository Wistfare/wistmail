'use client'

import { useState, useEffect, useCallback } from 'react'
import { Globe, Plus, RefreshCw, Trash2, Copy, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { InputField } from '@/components/ui/input-field'
import { SettingsCard } from '@/components/ui/settings-card'
import { Badge } from '@/components/ui/badge'
import { api } from '@/lib/api-client'

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

export default function DomainsSettingsPage() {
  const [domains, setDomains] = useState<Domain[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [newDomain, setNewDomain] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [copiedIdx, setCopiedIdx] = useState<string | null>(null)
  const [selectedDomain, setSelectedDomain] = useState<Domain | null>(null)

  const fetchDomains = useCallback(async () => {
    try {
      const res = await api.get<{ data: Domain[] }>('/api/v1/setup/domains')
      setDomains(res.data)
    } catch {}
  }, [])

  useEffect(() => {
    fetchDomains()
  }, [fetchDomains])

  async function addDomain(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await api.post('/api/v1/setup/domain', { name: newDomain })
      setNewDomain('')
      setShowAdd(false)
      await fetchDomains()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add domain')
    } finally {
      setLoading(false)
    }
  }

  async function verifyDomain(domainId: string) {
    try {
      await api.post(`/api/v1/setup/domain/${domainId}/verify`)
      await fetchDomains()
    } catch {}
  }

  async function viewRecords(domainId: string) {
    try {
      const result = await api.get<Domain>(`/api/v1/setup/domain/${domainId}`)
      setSelectedDomain(result)
    } catch {}
  }

  async function copyToClipboard(text: string, key: string) {
    await navigator.clipboard.writeText(text)
    setCopiedIdx(key)
    setTimeout(() => setCopiedIdx(null), 2000)
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold text-wm-text-primary">Domains</h1>
        <div className="flex-1" />
        <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setShowAdd(true)}>
          Add Domain
        </Button>
      </div>

      {showAdd && (
        <SettingsCard title="Add Domain" description="Enter the domain you want to configure.">
          <form onSubmit={addDomain} className="flex gap-3">
            <InputField
              icon={<Globe className="h-[18px] w-[18px]" />}
              placeholder="example.com"
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
              error={error}
              className="flex-1"
            />
            <Button type="submit" variant="primary" loading={loading}>
              Add
            </Button>
            <Button type="button" variant="ghost" onClick={() => setShowAdd(false)}>
              Cancel
            </Button>
          </form>
        </SettingsCard>
      )}

      {domains.map((domain) => (
        <SettingsCard key={domain.id} title={domain.name}>
          <div className="flex items-center gap-3">
            <Badge variant={domain.verified ? 'accent' : 'warning'}>
              {domain.verified ? 'Verified' : domain.status}
            </Badge>
            <div className="flex gap-1.5 font-mono text-xs">
              <span className={domain.mxVerified ? 'text-wm-accent' : 'text-wm-text-muted'}>MX</span>
              <span className={domain.spfVerified ? 'text-wm-accent' : 'text-wm-text-muted'}>SPF</span>
              <span className={domain.dkimVerified ? 'text-wm-accent' : 'text-wm-text-muted'}>DKIM</span>
              <span className={domain.dmarcVerified ? 'text-wm-accent' : 'text-wm-text-muted'}>DMARC</span>
            </div>
            <div className="flex-1" />
            <Button variant="secondary" size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={() => verifyDomain(domain.id)}>
              Verify
            </Button>
            <Button variant="ghost" size="sm" onClick={() => viewRecords(domain.id)}>
              DNS Records
            </Button>
          </div>

          {selectedDomain?.id === domain.id && selectedDomain.records && (
            <div className="mt-4 border border-wm-border">
              <div className="flex bg-wm-surface-hover px-4 py-2 font-mono text-[10px] font-semibold text-wm-text-muted">
                <span className="w-16">Type</span>
                <span className="flex-1">Name</span>
                <span className="flex-1">Value</span>
                <span className="w-12" />
              </div>
              {selectedDomain.records.map((rec, i) => (
                <div key={i} className="flex items-center border-t border-wm-border px-4 py-2">
                  <span className="w-16 font-mono text-xs font-medium text-wm-warning">{rec.type}</span>
                  <span className="flex-1 truncate font-mono text-xs text-wm-text-secondary">{rec.name}</span>
                  <span className="flex-1 truncate font-mono text-xs text-wm-text-secondary">
                    {rec.value.length > 50 ? rec.value.slice(0, 50) + '...' : rec.value}
                  </span>
                  <button
                    className="w-12 cursor-pointer text-right text-wm-text-muted hover:text-wm-text-secondary"
                    onClick={() => copyToClipboard(rec.value, `${domain.id}-${i}`)}
                  >
                    {copiedIdx === `${domain.id}-${i}` ? (
                      <Check className="inline h-3.5 w-3.5 text-wm-accent" />
                    ) : (
                      <Copy className="inline h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}
        </SettingsCard>
      ))}

      {domains.length === 0 && !showAdd && (
        <div className="flex flex-col items-center gap-4 py-16 text-center">
          <Globe className="h-10 w-10 text-wm-text-muted" />
          <p className="font-mono text-sm text-wm-text-tertiary">No domains configured yet.</p>
          <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setShowAdd(true)}>
            Add your first domain
          </Button>
        </div>
      )}
    </div>
  )
}
