'use client'

import { useState } from 'react'
import { ArrowLeft, Check, ExternalLink, Key, Loader2, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api-client'

interface StepDnsCloudflareProps {
  onStartVerification: () => void
  onBack: () => void
}

type RecordResult = { type: string; name: string; success: boolean; error?: string }

export function StepDnsCloudflare({ onStartVerification, onBack }: StepDnsCloudflareProps) {
  const [apiToken, setApiToken] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [connected, setConnected] = useState(false)
  const [zoneId, setZoneId] = useState('')
  const [connectError, setConnectError] = useState('')

  const [creating, setCreating] = useState(false)
  const [recordResults, setRecordResults] = useState<RecordResult[] | null>(null)
  const [allCreated, setAllCreated] = useState(false)

  async function handleConnect() {
    if (!apiToken.trim()) return
    setConnecting(true)
    setConnectError('')

    try {
      const res = await api.post<{ valid: boolean; zoneId?: string; error?: string }>(
        '/api/v1/setup/cloudflare/connect',
        { apiToken: apiToken.trim() },
      )

      if (res.valid && res.zoneId) {
        setConnected(true)
        setZoneId(res.zoneId)
      } else {
        setConnectError(res.error || 'Failed to connect to Cloudflare')
      }
    } catch (err: unknown) {
      setConnectError(err instanceof Error ? err.message : 'Failed to connect')
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
        // Auto-start verification after short delay
        setTimeout(onStartVerification, 1500)
      }
    } catch (err: unknown) {
      setConnectError(err instanceof Error ? err.message : 'Failed to create records')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-2xl font-semibold text-wm-text-primary">Connect with Cloudflare</h2>
      <p className="font-mono text-xs text-wm-text-tertiary">
        Automatically configure all DNS records via Cloudflare API.
      </p>

      {/* Step 1: API Token */}
      {!connected && (
        <>
          <div className="flex flex-col gap-2">
            <label className="font-mono text-sm font-medium text-wm-text-secondary">Cloudflare API Token</label>
            <div className="flex items-center border border-wm-border bg-wm-surface px-4 py-3 focus-within:border-wm-accent">
              <Key className="mr-3 h-4 w-4 text-wm-text-muted" />
              <input
                type="password"
                value={apiToken}
                onChange={(e) => setApiToken(e.target.value)}
                placeholder="Enter your API token"
                className="flex-1 bg-transparent font-mono text-sm text-wm-text-primary placeholder:text-wm-text-muted outline-none"
                autoFocus
              />
            </div>
            <a
              href="https://dash.cloudflare.com/profile/api-tokens"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 font-mono text-[10px] text-wm-text-muted hover:text-wm-accent"
            >
              Create a token with Zone:DNS:Edit permission <ExternalLink className="h-3 w-3" />
            </a>
          </div>

          {connectError && <p className="font-mono text-xs text-wm-error">{connectError}</p>}

          <div className="flex items-center gap-3">
            <Button variant="secondary" icon={<ArrowLeft className="h-4 w-4" />} onClick={onBack}>
              Back
            </Button>
            <Button variant="primary" loading={connecting} onClick={handleConnect}>
              Connect
            </Button>
          </div>
        </>
      )}

      {/* Step 2: Connected — create records */}
      {connected && !recordResults && (
        <>
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

          <div className="flex items-center gap-3">
            <Button variant="secondary" icon={<ArrowLeft className="h-4 w-4" />} onClick={onBack}>
              Back
            </Button>
            <Button variant="primary" loading={creating} onClick={handleCreateRecords}>
              Create DNS Records
            </Button>
          </div>
        </>
      )}

      {/* Step 3: Record creation results */}
      {recordResults && (
        <>
          <div className="flex flex-col gap-2">
            {recordResults.map((r, i) => (
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
            <div className="flex items-center gap-3">
              <Button variant="secondary" icon={<ArrowLeft className="h-4 w-4" />} onClick={onBack}>
                Back
              </Button>
              <Button variant="primary" onClick={handleCreateRecords} loading={creating}>
                Retry Failed Records
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
