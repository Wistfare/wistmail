'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ShieldCheck, ArrowRight } from 'lucide-react'
import { api } from '@/lib/api-client'
import {
  clearPendingMfa,
  readPendingMfa,
  type PendingMfa,
} from '@/lib/mfa-storage'
import { Button } from '@/components/ui/button'

/// Step 2 of the 2-step login. Reads the pending challenge from
/// sessionStorage and submits the user's TOTP / email / backup code via
/// /auth/login/verify. The backend dispatcher tries every factor.
export default function MfaChallengePage() {
  const router = useRouter()
  const [pending, setPending] = useState<PendingMfa | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [emailSending, setEmailSending] = useState(false)
  const [emailSent, setEmailSent] = useState(false)

  useEffect(() => {
    const p = readPendingMfa()
    if (!p) {
      router.replace('/login')
      return
    }
    setPending(p)
  }, [router])

  const hasTotp = pending?.methods.some((m) => m.type === 'totp') ?? false
  const hasEmail = pending?.methods.some((m) => m.type === 'email') ?? false

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!pending) return
    const trimmed = code.replace(/\s+/g, '')
    if (trimmed.length < 6) {
      setError('Enter the 6-digit code.')
      return
    }
    setLoading(true)
    setError('')
    try {
      type VerifyResponse = { user: { setupComplete: boolean } }
      const res = await api.post<VerifyResponse>('/api/v1/auth/login/verify', {
        pendingToken: pending.pendingToken,
        code: trimmed,
      })
      clearPendingMfa()
      router.push(res.user.setupComplete ? '/inbox' : '/setup')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'That code is incorrect.')
    } finally {
      setLoading(false)
    }
  }

  async function sendEmailCode() {
    if (!pending) return
    setEmailSending(true)
    setError('')
    try {
      await api.post('/api/v1/auth/login/email-code', {
        pendingToken: pending.pendingToken,
      })
      setEmailSent(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not send email code.')
    } finally {
      setEmailSending(false)
    }
  }

  if (!pending) {
    return null
  }

  return (
    <form onSubmit={submit} className="flex w-full max-w-sm flex-col items-center gap-7">
      <div className="flex h-16 w-16 items-center justify-center bg-wm-accent/10">
        <ShieldCheck className="h-7 w-7 text-wm-accent" />
      </div>

      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-2xl font-semibold text-wm-text-primary">
          Two-factor required
        </h1>
        <p className="font-mono text-xs text-wm-text-tertiary">
          {hasTotp
            ? 'Enter the 6-digit code from your authenticator app.'
            : 'Enter the 6-digit code we sent to your backup email.'}
        </p>
      </div>

      <div className="flex w-full items-center gap-2.5 border border-wm-accent bg-wm-surface px-4 py-3">
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
      {emailSent && !error && (
        <p className="font-mono text-xs text-wm-accent">
          Code sent. Check your backup email.
        </p>
      )}

      <Button
        type="submit"
        size="lg"
        loading={loading}
        icon={<ArrowRight className="h-4 w-4" />}
        className="w-full py-3.5"
      >
        Verify
      </Button>

      <div className="flex flex-col items-center gap-3">
        <Link
          href="/mfa/backup-code"
          className="font-mono text-xs font-semibold text-wm-accent hover:underline"
        >
          Use a backup code
        </Link>

        {hasEmail && hasTotp && (
          <button
            type="button"
            onClick={sendEmailCode}
            disabled={emailSending}
            className="cursor-pointer font-mono text-[11px] text-wm-text-muted hover:text-wm-text-secondary disabled:opacity-50"
          >
            {emailSending ? 'Sending email...' : 'Email me a code instead'}
          </button>
        )}

        <button
          type="button"
          onClick={() => {
            clearPendingMfa()
            router.push('/login')
          }}
          className="cursor-pointer font-mono text-[11px] text-wm-text-muted hover:text-wm-text-secondary"
        >
          Back to sign in
        </button>
      </div>
    </form>
  )
}
