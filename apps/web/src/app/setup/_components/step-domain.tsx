'use client'

import { useState } from 'react'
import { Globe, Check, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api-client'

type DnsRecord = { type: string; name: string; value: string; priority?: number; verified: boolean }

interface StepDomainProps {
  onNext: (data: { domain: string; domainId: string; records: DnsRecord[]; serverIp: string }) => void
}

export function StepDomain({ onNext }: StepDomainProps) {
  const [domain, setDomain] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [checkResult, setCheckResult] = useState<{
    domainExists: boolean
    resolvedIps: string[]
    serverIp: string
  } | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!domain.trim()) return

    setLoading(true)
    setError('')
    setCheckResult(null)

    try {
      // Step 1: Check domain
      const check = await api.post<{ domainExists: boolean; resolvedIps: string[]; serverIp: string }>(
        '/api/v1/setup/domain/check',
        { name: domain.trim() },
      )
      setCheckResult(check)

      // Step 2: Create domain (or resume if already registered)
      let res: { id: string; name: string; records: DnsRecord[]; serverIp: string }
      try {
        res = await api.post<{ id: string; name: string; records: DnsRecord[]; serverIp: string }>(
          '/api/v1/setup/domain',
          { name: domain.trim() },
        )
      } catch {
        // Domain already registered — try to resume existing setup
        const existing = await api.get<{ id: string; name: string; records: DnsRecord[]; serverIp: string }>(
          '/api/v1/setup/domain/records',
        )
        res = existing
      }

      onNext({
        domain: res.name,
        domainId: res.id,
        records: res.records,
        serverIp: res.serverIp || check.serverIp,
      })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add domain')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <h2 className="text-2xl font-semibold text-wm-text-primary">Add your domain</h2>
      <p className="font-mono text-xs text-wm-text-tertiary">
        Enter the domain you want to use for email. We&apos;ll verify it exists and detect your server IP for DNS configuration.
      </p>

      <div className="flex flex-col gap-2">
        <label className="font-mono text-sm font-medium text-wm-text-secondary">Domain name</label>
        <div className="flex items-center border border-wm-border bg-wm-surface px-4 py-3 focus-within:border-wm-accent">
          <Globe className="mr-3 h-4 w-4 text-wm-text-muted" />
          <input
            type="text"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="example.com"
            className="flex-1 bg-transparent font-mono text-sm text-wm-text-primary placeholder:text-wm-text-muted outline-none"
            autoFocus
          />
        </div>
      </div>

      {checkResult && (
        <div className="flex flex-col gap-2 border border-wm-border bg-wm-surface p-4">
          <div className="flex items-center gap-2">
            {checkResult.domainExists ? (
              <>
                <Check className="h-4 w-4 text-wm-accent" />
                <span className="font-mono text-xs text-wm-accent">
                  Domain resolves to {checkResult.resolvedIps.slice(0, 3).join(', ')}
                </span>
              </>
            ) : (
              <>
                <AlertTriangle className="h-4 w-4 text-wm-warning" />
                <span className="font-mono text-xs text-wm-warning">
                  Domain does not resolve yet. You can still proceed — DNS records will need to be configured.
                </span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-wm-text-muted" />
            <span className="font-mono text-xs text-wm-text-secondary">
              Server IP: <span className="text-wm-text-primary">{checkResult.serverIp}</span>
            </span>
          </div>
        </div>
      )}

      {error && <p className="font-mono text-xs text-wm-error">{error}</p>}

      <Button type="submit" variant="primary" loading={loading}>
        Continue
      </Button>
    </form>
  )
}
