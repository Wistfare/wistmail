'use client'

import { useState } from 'react'
import { AlertTriangle, Check, Globe, Server } from 'lucide-react'
import { api } from '@/lib/api-client'
import { cn } from '@/lib/utils'

type DnsRecord = {
  type: string
  name: string
  value: string
  priority?: number
  verified: boolean
}

interface StepDomainProps {
  onNext: (data: {
    domain: string
    domainId: string
    records: DnsRecord[]
    serverIp: string
  }) => void
}

/**
 * `/setup` step 1 — Pencil reference: `Screen/SetupV3-Domain` (`Jon4p`).
 *
 * formPane (gap 24 vertical):
 *   fHd:
 *     "STEP 1 · DOMAIN"           — 11/700 lime tracking 2
 *     "Add your domain"           — 30/700 white
 *     desc                        — 13/500 #6e6e6e line-height 1.6 fixed-width
 *   inField (gap 8 vertical):
 *     "DOMAIN NAME" label          — 9/700 #6e6e6e tracking 1.5
 *     inBox: 50h, radius 10, bg #111, 1px lime stroke, padding [0,16], gap 12
 *       globe 16×16 lime
 *       input — 15/600 white
 *   result (only when /domain/check returns success): radius 12, bg #1A2200,
 *     padding [14,16], gap 8, 1px lime stroke
 *       header: check 14×14 lime + "DOMAIN RESOLVES" 10/700 lime tracking 1.5
 *       resolution line: "wistmail.com → 138.68.45.103" 12/500 white
 *       serverRow: server 12×12 #6e6e6e + "Server IP: …" 11/500 #6e6e6e
 *   contBtn: 50h, radius 12, lime, "CONTINUE" 12/700 black tracking 2
 */
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

      let res: { id: string; name: string; records: DnsRecord[]; serverIp: string }
      try {
        res = await api.post<{
          id: string
          name: string
          records: DnsRecord[]
          serverIp: string
        }>('/api/v1/setup/domain', { name: domain.trim() })
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

  const inputActive = domain.trim().length > 0 || check !== null

  return (
    <form
      onSubmit={onSubmit}
      className="mx-auto flex w-full max-w-[480px] flex-col"
      style={{ gap: 24 }}
    >
      {/* fHd */}
      <div className="flex w-full flex-col" style={{ gap: 8 }}>
        <p
          className="font-mono font-bold uppercase text-wm-accent"
          style={{ fontSize: 11, letterSpacing: 2 }}
        >
          Step 1 · Domain
        </p>
        <h1
          className="font-mono font-bold leading-tight text-wm-text-primary"
          style={{ fontSize: 30 }}
        >
          Add your domain
        </h1>
        <p
          className="font-mono font-medium"
          style={{ fontSize: 13, lineHeight: 1.6, color: '#6e6e6e' }}
        >
          Enter the domain you want to use for email. We&rsquo;ll verify it
          exists and detect your server IP for DNS configuration.
        </p>
      </div>

      {/* inField */}
      <div className="flex w-full flex-col" style={{ gap: 8 }}>
        <span
          className="font-mono font-bold uppercase"
          style={{ fontSize: 9, letterSpacing: 1.5, color: '#6e6e6e' }}
        >
          Domain name
        </span>
        <div
          className="flex w-full items-center bg-wm-surface"
          style={{
            height: 50,
            borderRadius: 10,
            padding: '0 16px',
            gap: 12,
            border: `1px solid ${
              inputActive
                ? 'var(--color-wm-accent)'
                : 'var(--color-wm-border)'
            }`,
          }}
        >
          <Globe
            className="text-wm-accent"
            aria-hidden
            style={{ width: 16, height: 16 }}
          />
          <input
            type="text"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="example.com"
            autoFocus
            autoComplete="off"
            spellCheck={false}
            required
            className="min-w-0 flex-1 bg-transparent font-mono outline-none placeholder:text-wm-text-muted"
            style={{ fontSize: 15, fontWeight: 600, color: '#FFFFFF' }}
          />
        </div>
      </div>

      {/* result block — Pencil shows it always when check resolves */}
      {check && (
        <div
          className="flex w-full flex-col"
          style={{
            borderRadius: 12,
            background: 'var(--color-wm-accent-dim)',
            padding: '14px 16px',
            gap: 8,
            border: '1px solid var(--color-wm-accent)',
          }}
        >
          <div className="flex items-center" style={{ gap: 10 }}>
            {check.domainExists ? (
              <>
                <Check
                  className="text-wm-accent"
                  aria-hidden
                  style={{ width: 14, height: 14 }}
                />
                <span
                  className="font-mono font-bold uppercase text-wm-accent"
                  style={{ fontSize: 10, letterSpacing: 1.5 }}
                >
                  Domain resolves
                </span>
              </>
            ) : (
              <>
                <AlertTriangle
                  className="text-wm-warning"
                  aria-hidden
                  style={{ width: 14, height: 14 }}
                />
                <span
                  className="font-mono font-bold uppercase text-wm-warning"
                  style={{ fontSize: 10, letterSpacing: 1.5 }}
                >
                  Domain doesn&rsquo;t resolve yet
                </span>
              </>
            )}
          </div>
          <p
            className="font-mono font-medium text-wm-text-primary"
            style={{ fontSize: 12 }}
          >
            {domain.trim()}
            {check.resolvedIps.length > 0
              ? ` → ${check.resolvedIps.slice(0, 3).join(', ')}`
              : ''}
          </p>
          <div className="flex items-center" style={{ gap: 8 }}>
            <Server
              aria-hidden
              style={{ width: 12, height: 12, color: '#6e6e6e' }}
            />
            <span
              className="font-mono font-medium"
              style={{ fontSize: 11, color: '#6e6e6e' }}
            >
              Server IP: {check.serverIp}
            </span>
          </div>
        </div>
      )}

      {error && (
        <p className="font-mono text-wm-error" style={{ fontSize: 11 }}>
          {error}
        </p>
      )}

      {/* contBtn */}
      <button
        type="submit"
        disabled={loading || !domain.trim()}
        className={cn(
          'flex w-full cursor-pointer items-center justify-center font-mono font-bold uppercase',
          'bg-wm-accent text-wm-text-on-accent transition-colors hover:bg-wm-accent-hover',
          'disabled:cursor-not-allowed disabled:opacity-60',
        )}
        style={{
          height: 50,
          borderRadius: 12,
          fontSize: 12,
          letterSpacing: 2,
          boxShadow: '0 6px 24px 0 rgba(191,255,0,0.25)',
        }}
      >
        {loading ? (
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : (
          'Continue'
        )}
      </button>
    </form>
  )
}
