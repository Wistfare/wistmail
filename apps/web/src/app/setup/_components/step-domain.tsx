'use client'

import { useState } from 'react'
import { ArrowRight, AlertTriangle, CheckCircle2, Globe } from 'lucide-react'
import { api } from '@/lib/api-client'
import {
  AuthButton,
  AuthCard,
  AuthHeading,
  AuthInput,
} from '@/components/auth'

type DnsRecord = { type: string; name: string; value: string; priority?: number; verified: boolean }

interface StepDomainProps {
  onNext: (data: { domain: string; domainId: string; records: DnsRecord[]; serverIp: string }) => void
}

/** Pencil reference: `SetupV3-Domain` (`Jon4p`). */
export function StepDomain({ onNext }: StepDomainProps) {
  const [domain, setDomain] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [check, setCheck] = useState<{
    domainExists: boolean
    resolvedIps: string[]
    serverIp: string
  } | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!domain.trim()) return
    setLoading(true)
    setError('')
    setCheck(null)
    try {
      const checkRes = await api.post<{
        domainExists: boolean
        resolvedIps: string[]
        serverIp: string
      }>('/api/v1/setup/domain/check', { name: domain.trim() })
      setCheck(checkRes)

      // Create domain (or resume existing record).
      let res: { id: string; name: string; records: DnsRecord[]; serverIp: string }
      try {
        res = await api.post<{ id: string; name: string; records: DnsRecord[]; serverIp: string }>(
          '/api/v1/setup/domain',
          { name: domain.trim() },
        )
      } catch {
        const existing = await api.get<{
          id: string
          name: string
          records: DnsRecord[]
          serverIp: string
        }>('/api/v1/setup/domain/records')
        res = existing
      }

      onNext({
        domain: res.name,
        domainId: res.id,
        records: res.records,
        serverIp: res.serverIp || checkRes.serverIp,
      })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add domain')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <AuthCard>
        <AuthHeading
          eyebrow="Step 1 · Domain"
          title="Add your domain"
          description="Enter the domain you want to use for email. We'll verify it exists and detect your server IP for DNS configuration."
        />

        <AuthInput
          label="Domain name"
          placeholder="example.com"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          icon={<Globe className="h-4 w-4" />}
          autoFocus
          autoComplete="off"
          spellCheck={false}
          required
        />

        {check && (
          <div className="rounded-[12px] border border-wm-accent bg-wm-accent-dim px-4 py-3.5">
            <div className="flex items-center gap-2">
              {check.domainExists ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-wm-accent" />
                  <p className="font-mono text-[12px] font-medium text-wm-text-primary">
                    {domain.trim()} → {check.resolvedIps.slice(0, 3).join(', ')}
                  </p>
                </>
              ) : (
                <>
                  <AlertTriangle className="h-4 w-4 text-wm-warning" />
                  <p className="font-mono text-[12px] font-medium text-wm-warning">
                    Domain does not resolve yet — DNS records will fix this.
                  </p>
                </>
              )}
            </div>
            <p className="mt-1 pl-6 font-mono text-[11px] text-wm-text-tertiary">
              Server IP detected: {check.serverIp}
            </p>
          </div>
        )}

        {error && <p className="font-mono text-[11px] text-wm-error">{error}</p>}

        <AuthButton type="submit" loading={loading} trailingIcon={<ArrowRight className="h-4 w-4" />}>
          Continue
        </AuthButton>
      </AuthCard>
    </form>
  )
}
