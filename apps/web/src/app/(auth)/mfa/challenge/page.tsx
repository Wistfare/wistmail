'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowRight, KeyRound, Mail, ShieldCheck } from 'lucide-react'
import { api } from '@/lib/api-client'
import {
  clearPendingMfa,
  readPendingMfa,
  type PendingMfa,
} from '@/lib/mfa-storage'
import {
  AuthButton,
  AuthCard,
  AuthHeading,
  AuthHeroIcon,
  OtpInput,
} from '@/components/auth'
import { cn } from '@/lib/utils'

/**
 * `/mfa/challenge` — Pencil `Screen/MFAChallengeV3` (`XTWjb`).
 *
 * Step 2 of the 2-step login. Reads the pending challenge from
 * sessionStorage and verifies the user's TOTP / email / backup code via
 * `POST /api/v1/auth/login/verify`. Backend dispatcher tries every factor.
 */
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

  async function verify(c: string) {
    if (!pending) return
    if (c.length < 6) {
      setError('Enter the 6-digit code')
      return
    }
    setLoading(true)
    setError('')
    try {
      type VerifyResponse = { user: { setupComplete: boolean } }
      const res = await api.post<VerifyResponse>('/api/v1/auth/login/verify', {
        pendingToken: pending.pendingToken,
        code: c,
      })
      clearPendingMfa()
      router.push(res.user.setupComplete ? '/inbox' : '/setup')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'That code is incorrect.')
    } finally {
      setLoading(false)
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    await verify(code.replace(/\s+/g, ''))
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

  if (!pending) return null

  return (
    <form onSubmit={onSubmit} className="w-full">
      <AuthCard className="items-stretch">
        <AuthHeroIcon>
          <ShieldCheck className="h-9 w-9" />
        </AuthHeroIcon>
        <AuthHeading
          eyebrow="Two-factor · required"
          title="Verify it's you"
          description={
            hasTotp
              ? 'Enter the 6-digit code from your authenticator app.'
              : 'Enter the 6-digit code we sent to your backup email.'
          }
        />

        <OtpInput
          value={code}
          onChange={setCode}
          onComplete={(c) => verify(c)}
          autoFocus
          status={error ? 'error' : 'default'}
        />

        {error && <p className="text-center font-mono text-[11px] text-wm-error">{error}</p>}
        {emailSent && !error && (
          <p className="text-center font-mono text-[11px] text-wm-accent">
            Code sent. Check your backup email.
          </p>
        )}

        <AuthButton type="submit" loading={loading} trailingIcon={<ArrowRight className="h-4 w-4" />}>
          Verify
        </AuthButton>

        <div className="rounded-[12px] border border-wm-border bg-wm-surface p-1.5">
          <Link
            href="/mfa/backup-code"
            className={cn(
              'flex w-full items-center gap-2.5 rounded-[8px] px-3 py-2.5 font-mono text-[12px] text-wm-text-secondary transition-colors',
              'hover:bg-wm-surface-hover hover:text-wm-text-primary',
            )}
          >
            <KeyRound className="h-3.5 w-3.5" />
            Use a backup code
          </Link>
          {hasEmail && hasTotp && (
            <>
              <div className="h-px bg-wm-border" />
              <button
                type="button"
                onClick={sendEmailCode}
                disabled={emailSending}
                className={cn(
                  'flex w-full cursor-pointer items-center gap-2.5 rounded-[8px] px-3 py-2.5 font-mono text-[12px] text-wm-text-secondary transition-colors',
                  'hover:bg-wm-surface-hover hover:text-wm-text-primary',
                  'disabled:opacity-50',
                )}
              >
                <Mail className="h-3.5 w-3.5" />
                {emailSending ? 'Sending email…' : 'Email me a code instead'}
              </button>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={() => {
            clearPendingMfa()
            router.push('/login')
          }}
          className="cursor-pointer text-center font-mono text-[11px] text-wm-text-tertiary hover:text-wm-text-secondary"
        >
          Back to sign in
        </button>
      </AuthCard>
    </form>
  )
}
