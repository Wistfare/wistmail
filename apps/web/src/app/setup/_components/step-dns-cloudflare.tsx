'use client'

import { useState, useEffect } from 'react'
import { Cloud, Key, ExternalLink, Check, XCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api-client'

interface StepDnsCloudflareProps {
  onStartVerification: () => void
  onBack: () => void
}

type RecordResult = { type: string; name: string; success: boolean; error?: string }

export function StepDnsCloudflare({ onStartVerification, onBack }: StepDnsCloudflareProps) {
  const [loading, setLoading] = useState(true)
  const [domainConnectUrl, setDomainConnectUrl] = useState<string | null>(null)
  const [useFallback, setUseFallback] = useState(false)
  const [error, setError] = useState('')

  // Token fallback state
  const [apiToken, setApiToken] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [connected, setConnected] = useState(false)
  const [zoneId, setZoneId] = useState('')
  const [creating, setCreating] = useState(false)
  const [recordResults, setRecordResults] = useState<RecordResult[] | null>(null)
  const [allCreated, setAllCreated] = useState(false)

  // On mount, try to get Domain Connect URL
  useEffect(() => {
    api
      .get<{ url: string | null; fallback?: boolean; domain: string; error?: string }>(
        '/api/v1/setup/domain-connect/url',
      )
      .then((res) => {
        if (res.url) {
          setDomainConnectUrl(res.url)
        } else {
          setUseFallback(true)
        }
      })
      .catch(() => {
        setUseFallback(true)
      })
      .finally(() => setLoading(false))
  }, [])

  // Handle Domain Connect redirect
  function handleDomainConnect() {
    if (domainConnectUrl) {
      window.location.href = domainConnectUrl
    }
  }

  // Token fallback handlers
  async function handleConnect() {
    if (!apiToken.trim()) return
    setConnecting(true)
    setError('')

    try {
      const res = await api.post<{ valid: boolean; zoneId?: string; error?: string }>(
        '/api/v1/setup/cloudflare/connect',
        { apiToken: apiToken.trim() },
      )

      if (res.valid && res.zoneId) {
        setConnected(true)
        setZoneId(res.zoneId)
      } else {
        setError(res.error || 'Failed to connect to Cloudflare')
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to connect')
    } finally {
      setConnecting(false)
    }
  }

  async function handleCreateRecords() {
    setCreating(true)
    try {
      const res = await api.post<{ results: RecordResult[]; allCreated: boolean }>(
        '/api/v1/setup/cloudflare/create-records',
        { apiToken: apiToken.trim() },
      )
      setRecordResults(res.results)
      setAllCreated(res.allCreated)

      if (res.allCreated) {
        setTimeout(onStartVerification, 1500)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create records')
    } finally {
      setCreating(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center gap-4 py-12">
        <Loader2 className="h-8 w-8 animate-spin text-wm-accent" />
        <p className="font-mono text-xs text-wm-text-muted">Preparing Cloudflare connection...</p>
      </div>
    )
  }

  // ── Domain Connect Flow (primary) ───────────────────────────────────────────
  if (domainConnectUrl && !useFallback) {
    return (
      <div className="flex flex-col gap-6">
        <h2 className="text-2xl font-semibold text-wm-text-primary">Connect with Cloudflare</h2>
        <p className="font-mono text-xs text-wm-text-tertiary">
          Click the button below to authorize Wistfare Mail to configure your DNS records automatically via Cloudflare.
        </p>

        <div className="border border-wm-border bg-wm-surface p-6">
          <div className="mb-4 flex items-center gap-3">
            <Cloud className="h-6 w-6 text-wm-accent" />
            <div>
              <p className="font-mono text-sm font-semibold text-wm-text-primary">Automatic DNS Configuration</p>
              <p className="font-mono text-[10px] text-wm-text-muted">
                You&apos;ll be redirected to Cloudflare to authorize the DNS changes. No API keys needed.
              </p>
            </div>
          </div>

          <p className="mb-4 font-mono text-[10px] text-wm-text-muted">
            The following records will be created: MX, SPF, DKIM, and DMARC
          </p>

          <Button variant="primary" onClick={handleDomainConnect}>
            Authorize on Cloudflare
          </Button>
        </div>

        <button
          onClick={() => setUseFallback(true)}
          className="cursor-pointer font-mono text-[10px] text-wm-text-muted hover:text-wm-text-secondary"
        >
          Having trouble? Use API token instead
        </button>

        <button
          onClick={onBack}
          className="cursor-pointer font-mono text-xs text-wm-text-muted hover:text-wm-text-secondary"
        >
          Back to DNS method selection
        </button>
      </div>
    )
  }

  // ── Token Fallback Flow ─────────────────────────────────────────────────────

  // Step 1: Enter token
  if (!connected && !recordResults) {
    return (
      <div className="flex flex-col gap-6">
        <h2 className="text-2xl font-semibold text-wm-text-primary">Connect with Cloudflare</h2>
        <p className="font-mono text-xs text-wm-text-tertiary">
          Create a Cloudflare API token and paste it below to automatically configure DNS records.
        </p>

        {/* Step-by-step guide */}
        <div className="flex flex-col gap-3">
          <div className="flex items-start gap-3 border border-wm-border bg-wm-surface p-4">
            <span className="flex h-6 w-6 items-center justify-center bg-wm-accent font-mono text-xs font-bold text-wm-text-on-accent">1</span>
            <div>
              <p className="font-mono text-xs font-medium text-wm-text-primary">Open Cloudflare API Tokens</p>
              <a
                href="https://dash.cloudflare.com/profile/api-tokens"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 font-mono text-[10px] text-wm-accent hover:underline"
              >
                Open Cloudflare Dashboard <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>

          <div className="flex items-start gap-3 border border-wm-border bg-wm-surface p-4">
            <span className="flex h-6 w-6 items-center justify-center bg-wm-accent font-mono text-xs font-bold text-wm-text-on-accent">2</span>
            <div>
              <p className="font-mono text-xs font-medium text-wm-text-primary">Create a token with &quot;Edit zone DNS&quot; permission</p>
              <p className="font-mono text-[10px] text-wm-text-muted">
                Click &quot;Create Token&quot; → Use &quot;Edit zone DNS&quot; template → Create Token
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 border border-wm-border bg-wm-surface p-4">
            <span className="flex h-6 w-6 items-center justify-center bg-wm-accent font-mono text-xs font-bold text-wm-text-on-accent">3</span>
            <div>
              <p className="font-mono text-xs font-medium text-wm-text-primary">Paste your token below</p>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center border border-wm-border bg-wm-surface px-4 py-3 focus-within:border-wm-accent">
            <Key className="mr-3 h-4 w-4 text-wm-text-muted" />
            <input
              type="password"
              value={apiToken}
              onChange={(e) => setApiToken(e.target.value)}
              placeholder="Paste your Cloudflare API token"
              className="flex-1 bg-transparent font-mono text-sm text-wm-text-primary placeholder:text-wm-text-muted outline-none"
              autoFocus
            />
          </div>
        </div>

        {error && <p className="font-mono text-xs text-wm-error">{error}</p>}

        <div className="flex items-center gap-3">
          <Button variant="primary" loading={connecting} onClick={handleConnect}>
            Connect
          </Button>
        </div>

        <button
          onClick={onBack}
          className="cursor-pointer font-mono text-xs text-wm-text-muted hover:text-wm-text-secondary"
        >
          Back to DNS method selection
        </button>
      </div>
    )
  }

  // Step 2: Connected — create records
  if (connected && !recordResults) {
    return (
      <div className="flex flex-col gap-6">
        <h2 className="text-2xl font-semibold text-wm-text-primary">Connect with Cloudflare</h2>

        <div className="flex items-center gap-3 border border-wm-accent/30 bg-wm-accent/5 p-4">
          <Check className="h-5 w-5 text-wm-accent" />
          <div>
            <p className="font-mono text-sm text-wm-accent">Connected to Cloudflare</p>
            <p className="font-mono text-[10px] text-wm-text-muted">Zone ID: {zoneId}</p>
          </div>
        </div>

        <p className="font-mono text-xs text-wm-text-tertiary">
          Ready to create all 4 DNS records (MX, SPF, DKIM, DMARC) automatically.
        </p>

        <Button variant="primary" loading={creating} onClick={handleCreateRecords}>
          Create DNS Records
        </Button>
      </div>
    )
  }

  // Step 3: Record creation results
  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-2xl font-semibold text-wm-text-primary">Connect with Cloudflare</h2>

      <div className="flex flex-col gap-2">
        {recordResults?.map((r, i) => (
          <div key={i} className="flex items-center gap-3 border border-wm-border bg-wm-surface px-4 py-3">
            {r.success ? (
              <Check className="h-4 w-4 text-wm-accent" />
            ) : (
              <XCircle className="h-4 w-4 text-wm-error" />
            )}
            <div className="flex-1">
              <p className="font-mono text-xs text-wm-text-primary">{r.type} — {r.name}</p>
              {r.error && <p className="font-mono text-[10px] text-wm-error">{r.error}</p>}
            </div>
            <span className={`font-mono text-[10px] font-semibold ${r.success ? 'text-wm-accent' : 'text-wm-error'}`}>
              {r.success ? 'Created' : 'Failed'}
            </span>
          </div>
        ))}
      </div>

      {allCreated && (
        <div className="flex items-center gap-2 font-mono text-xs text-wm-accent">
          <Loader2 className="h-4 w-4 animate-spin" />
          All records created. Starting verification...
        </div>
      )}

      {!allCreated && (
        <Button variant="primary" onClick={handleCreateRecords} loading={creating}>
          Retry Failed Records
        </Button>
      )}
    </div>
  )
}
