'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, Info, Mail, Send } from 'lucide-react'
import { api } from '@/lib/api-client'
import {
  AuthButton,
  AuthCard,
  AuthHeading,
  AuthHeroIcon,
  AuthInput,
  OtpInput,
} from '@/components/auth'

const FRESH_BACKUP_KEY = 'wm_fresh_backup_codes'

/**
 * `/mfa/setup/email` — Pencil reference: `Screen/MFASetupV3-Email` (`KoLiZ`).
 *
 * Two-step inline form:
 *   Step 1 (`address`): "Add a backup address" — email AuthInput + a small
 *     info banner ("This address is only used for security…") + primary
 *     "Send verification code" CTA.
 *   Step 2 (`code`):    OtpInput for the 6-digit code we just dispatched
 *     + "Use a different address" + primary "Verify & continue" CTA.
 *
 * Backend: POST /api/v1/mfa/email/setup { address } → { methodId }
 *          POST /api/v1/mfa/email/confirm { methodId, code } →
 *            { ok, backupCodes: [10 codes] | null }
 */
export default function MfaEmailSetupPage() {
  const router = useRouter()
  const [step, setStep] = useState<'address' | 'code'>('address')
  const [address, setAddress] = useState('')
  const [methodId, setMethodId] = useState('')
  const [code, setCode] = useState('')
  const [sending, setSending] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState('')

  async function sendCode(e: React.FormEvent) {
    e.preventDefault()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      setError('Enter a valid email address')
      return
    }
    setSending(true)
    setError('')
    try {
      const res = await api.post<{ methodId: string }>('/api/v1/mfa/email/setup', {
        address: address.trim().toLowerCase(),
      })
      setMethodId(res.methodId)
      setStep('code')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not send code')
    } finally {
      setSending(false)
    }
  }

  async function verify(c: string) {
    if (c.length < 6) {
      setError('Enter the 6-digit code')
      return
    }
    setVerifying(true)
    setError('')
    try {
      const res = await api.post<{ ok: true; backupCodes: string[] | null }>(
        '/api/v1/mfa/email/confirm',
        { methodId, code: c },
      )
      if (res.backupCodes && res.backupCodes.length > 0) {
        sessionStorage.setItem(FRESH_BACKUP_KEY, JSON.stringify(res.backupCodes))
        router.push('/mfa/backup-codes')
      } else {
        router.push('/inbox')
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'That code is incorrect')
    } finally {
      setVerifying(false)
    }
  }

  async function onCodeSubmit(e: React.FormEvent) {
    e.preventDefault()
    await verify(code.replace(/\s+/g, ''))
  }

  if (step === 'address') {
    return (
      <AuthCard>
        <AuthHeroIcon>
          <Mail className="h-9 w-9" />
        </AuthHeroIcon>
        <AuthHeading
          eyebrow="Security · Email factor"
          title="Add a backup address"
          description="We'll send a 6-digit code here whenever you sign in or reset your password."
        />

        <form onSubmit={sendCode} className="flex flex-col gap-4">
          <AuthInput
            label="Address"
            type="email"
            placeholder="recovery@gmail.com"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            error={error}
            icon={<Mail className="h-[18px] w-[18px]" />}
            autoComplete="email"
            autoFocus
          />

          <AuthButton
            type="submit"
            loading={sending}
            icon={<Send className="h-4 w-4" />}
          >
            Send verification code
          </AuthButton>

          <div
            className="flex items-start gap-2 rounded-[10px] border border-wm-border bg-wm-surface px-3 py-2.5"
          >
            <Info className="mt-0.5 h-3.5 w-3.5 text-wm-text-muted" />
            <p
              className="font-mono"
              style={{ fontSize: 11, color: '#6e6e6e', lineHeight: 1.5 }}
            >
              This address is only used for security. We never send marketing here
              and never share it.
            </p>
          </div>
        </form>

        <Link
          href="/mfa/setup"
          className="flex items-center gap-1.5 self-start font-mono text-wm-text-tertiary transition-colors hover:text-wm-text-secondary"
          style={{ fontSize: 11 }}
        >
          <ArrowLeft className="h-3 w-3" />
          Back to method picker
        </Link>
      </AuthCard>
    )
  }

  return (
    <AuthCard>
      <AuthHeroIcon>
        <Mail className="h-9 w-9" />
      </AuthHeroIcon>
      <AuthHeading
        eyebrow="Security · Verify"
        title="Check your inbox"
        description={`We sent a 6-digit code to ${address}. Enter it below to confirm.`}
      />

      <form onSubmit={onCodeSubmit} className="flex flex-col gap-4">
        <OtpInput
          value={code}
          onChange={setCode}
          onComplete={(c) => verify(c)}
          autoFocus
          status={error ? 'error' : 'default'}
        />

        {error && (
          <p className="text-center font-mono text-wm-error" style={{ fontSize: 11 }}>
            {error}
          </p>
        )}

        <AuthButton
          type="submit"
          loading={verifying}
          disabled={code.replace(/\s+/g, '').length < 6}
          trailingIcon={<ArrowRight className="h-4 w-4" />}
        >
          Verify &amp; continue
        </AuthButton>

        <button
          type="button"
          onClick={() => {
            setStep('address')
            setCode('')
            setError('')
          }}
          className="cursor-pointer font-mono text-wm-text-tertiary transition-colors hover:text-wm-text-secondary"
          style={{ fontSize: 11 }}
        >
          Use a different address
        </button>
      </form>
    </AuthCard>
  )
}
