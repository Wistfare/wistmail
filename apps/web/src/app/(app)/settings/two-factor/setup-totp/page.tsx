'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { QRCodeSVG } from 'qrcode.react'
import { ArrowLeft, ArrowRight, Copy, Check } from 'lucide-react'
import { api } from '@/lib/api-client'
import { Button } from '@/components/ui/button'

type SetupResponse = {
  methodId: string
  secret: string
  otpauthUrl: string
}

type VerifyResponse = {
  ok: true
  backupCodes: string[] | null
}

export default function TotpSetupPage() {
  const router = useRouter()
  const [setup, setSetup] = useState<SetupResponse | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    api
      .post<SetupResponse>('/api/v1/mfa/totp/setup')
      .then((res) => {
        if (!cancelled) setSetup(res)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not start setup')
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function copySecret() {
    if (!setup) return
    try {
      await navigator.clipboard.writeText(setup.secret)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault()
    if (!setup) return
    const trimmed = code.replace(/\s+/g, '')
    if (trimmed.length < 6) {
      setError('Enter the 6-digit code')
      return
    }
    setVerifying(true)
    setError('')
    try {
      const res = await api.post<VerifyResponse>('/api/v1/mfa/totp/verify', {
        methodId: setup.methodId,
        code: trimmed,
      })
      if (res.backupCodes && res.backupCodes.length > 0) {
        sessionStorage.setItem('wm_fresh_backup_codes', JSON.stringify(res.backupCodes))
        router.push('/settings/two-factor/backup-codes')
      } else {
        router.push('/settings/two-factor')
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'That code is incorrect')
    } finally {
      setVerifying(false)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link
          href="/settings/two-factor/setup"
          className="flex items-center gap-1.5 font-mono text-[11px] text-wm-text-muted hover:text-wm-text-secondary"
        >
          <ArrowLeft className="h-3 w-3" />
          Back
        </Link>
        <h1 className="text-2xl font-semibold text-wm-text-primary">Authenticator app</h1>
        <p className="font-mono text-xs text-wm-text-tertiary">
          Scan the QR code with your authenticator, then enter the 6-digit code it shows.
        </p>
      </div>

      <div className="grid gap-6 border border-wm-border bg-wm-surface p-6 md:grid-cols-[260px_1fr]">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-[240px] w-[240px] items-center justify-center border border-wm-border bg-white p-3">
            {setup ? (
              <QRCodeSVG value={setup.otpauthUrl} size={216} level="M" />
            ) : (
              <div className="font-mono text-xs text-wm-text-muted">Loading…</div>
            )}
          </div>
          {setup && (
            <button
              type="button"
              onClick={copySecret}
              className="flex items-center gap-1.5 font-mono text-[11px] text-wm-text-muted hover:text-wm-text-secondary"
            >
              {copied ? (
                <>
                  <Check className="h-3 w-3 text-wm-accent" />
                  <span className="text-wm-accent">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" />
                  Copy setup key
                </>
              )}
            </button>
          )}
          {setup && (
            <p className="break-all text-center font-mono text-[10px] text-wm-text-muted">
              {setup.secret}
            </p>
          )}
        </div>

        <form onSubmit={verify} className="flex flex-col gap-4">
          <div>
            <p className="text-sm font-semibold text-wm-text-primary">Verify the code</p>
            <p className="mt-1 font-mono text-[11px] text-wm-text-tertiary">
              Open the app and type in the 6-digit code it shows for &ldquo;Wistfare Mail&rdquo;.
            </p>
          </div>

          <div className="flex items-center gap-2.5 border border-wm-accent bg-wm-surface px-4 py-3">
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="123 456"
              className="min-w-0 flex-1 bg-transparent text-center font-mono text-xl font-semibold tracking-[0.4em] text-wm-text-primary placeholder:text-wm-text-muted outline-none"
            />
          </div>

          {error && <p className="font-mono text-xs text-wm-error">{error}</p>}

          <div className="flex items-center justify-end gap-3">
            <Link
              href="/settings/two-factor"
              className="font-mono text-xs text-wm-text-muted hover:text-wm-text-secondary"
            >
              Cancel
            </Link>
            <Button
              type="submit"
              size="sm"
              loading={verifying}
              icon={<ArrowRight className="h-3.5 w-3.5" />}
            >
              Verify
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
