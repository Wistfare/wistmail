'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Lock,
  ShieldCheck,
} from 'lucide-react'
import { WistMailError } from '@wistmail/shared'
import { api } from '@/lib/api-client'
import {
  AuthButton,
  AuthCard,
  AuthHeading,
  AuthHeroIcon,
  AuthInput,
  OtpInput,
} from '@/components/auth'

/** `/reset-password?token=…` — V3 split layout. Backend: `POST /api/v1/auth/reset-password`. */
function ResetPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token') ?? ''

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  // Two-step state — once the API returns 412 MFA_REQUIRED we keep the
  // password/confirm valid in memory and prompt for an OTP.
  const [mfaRequired, setMfaRequired] = useState(false)
  const [mfaCode, setMfaCode] = useState('')

  const checks = {
    length: password.length >= 8,
    upper: /[A-Z]/.test(password),
    lower: /[a-z]/.test(password),
    number: /\d/.test(password),
  }
  const allOk = checks.length && checks.upper && checks.lower && checks.number
  const matches = password.length > 0 && password === confirm

  if (!token) {
    return (
      <AuthCard className="items-center text-center">
        <AuthHeroIcon>
          <AlertTriangle className="h-9 w-9 text-wm-error" />
        </AuthHeroIcon>
        <AuthHeading
          eyebrow="Invalid link"
          title="Token missing"
          description="This reset link is missing its token. Request a new one."
        />
        <Link
          href="/forgot-password"
          className="font-mono text-[11px] font-bold uppercase tracking-[1.5px] text-wm-accent hover:underline"
        >
          Request a new link →
        </Link>
      </AuthCard>
    )
  }

  if (done) {
    return (
      <AuthCard className="items-center text-center">
        <AuthHeroIcon>
          <CheckCircle2 className="h-9 w-9" />
        </AuthHeroIcon>
        <AuthHeading
          eyebrow="All set"
          title="Password updated"
          description="Sign in with your new password."
        />
        <AuthButton onClick={() => router.push('/login')} trailingIcon={<ArrowRight className="h-4 w-4" />}>
          Go to sign in
        </AuthButton>
      </AuthCard>
    )
  }

  async function submit(payload: { token: string; newPassword: string; mfaCode?: string }) {
    setLoading(true)
    setError('')
    try {
      await api.post('/api/v1/auth/reset-password', payload)
      setDone(true)
    } catch (err: unknown) {
      // Backend returns 412 + code MFA_REQUIRED when the user has MFA and
      // we haven't supplied a code yet. Switch into the MFA-prompt state
      // instead of surfacing it as an error.
      if (err instanceof WistMailError && err.code === 'MFA_REQUIRED') {
        setMfaRequired(true)
        setError('')
      } else {
        setError(err instanceof Error ? err.message : 'Could not reset password')
      }
    } finally {
      setLoading(false)
    }
  }

  async function onPasswordSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!allOk) return setError('Password does not meet the requirements')
    if (!matches) return setError('Passwords do not match')
    await submit({ token, newPassword: password })
  }

  async function onMfaSubmit(e?: React.FormEvent) {
    e?.preventDefault()
    const c = mfaCode.replace(/\s+/g, '')
    if (c.length < 6) return setError('Enter the 6-digit code')
    await submit({ token, newPassword: password, mfaCode: c })
  }

  if (mfaRequired) {
    return (
      <form onSubmit={onMfaSubmit} className="w-full">
        <AuthCard>
          <AuthHeroIcon>
            <ShieldCheck className="h-9 w-9" />
          </AuthHeroIcon>
          <AuthHeading
            eyebrow="Two-factor · required"
            title="Verify before reset"
            description="Enter the 6-digit code from your authenticator to confirm it's you."
          />
          <OtpInput
            value={mfaCode}
            onChange={setMfaCode}
            onComplete={(c) => submit({ token, newPassword: password, mfaCode: c })}
            autoFocus
          />
          {error && <p className="text-center font-mono text-[11px] text-wm-error">{error}</p>}
          <AuthButton type="submit" loading={loading} trailingIcon={<ArrowRight className="h-4 w-4" />}>
            Verify and reset
          </AuthButton>
          <button
            type="button"
            onClick={() => {
              setMfaRequired(false)
              setMfaCode('')
              setError('')
            }}
            className="cursor-pointer font-mono text-[11px] text-wm-text-tertiary hover:text-wm-text-secondary"
          >
            Back
          </button>
        </AuthCard>
      </form>
    )
  }

  return (
    <form onSubmit={onPasswordSubmit} className="w-full">
      <AuthCard>
        <AuthHeading
          eyebrow="Reset password"
          title="Choose a new password"
          description="At least 8 characters with an uppercase letter and a number."
        />

        <AuthInput
          label="New password"
          type="password"
          reveal
          placeholder="Enter a new password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          icon={<Lock className="h-4 w-4" />}
          autoComplete="new-password"
          autoFocus
          required
        />

        <div className="flex flex-wrap gap-3 font-mono text-[10px]">
          <span className={checks.length ? 'text-wm-accent' : 'text-wm-text-muted'}>✓ 8+ chars</span>
          <span className={checks.upper ? 'text-wm-accent' : 'text-wm-text-muted'}>✓ Uppercase</span>
          <span className={checks.lower ? 'text-wm-accent' : 'text-wm-text-muted'}>✓ Lowercase</span>
          <span className={checks.number ? 'text-wm-accent' : 'text-wm-text-muted'}>✓ Number</span>
        </div>

        <AuthInput
          label="Confirm password"
          type="password"
          reveal
          placeholder="Re-enter your new password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          icon={<Lock className="h-4 w-4" />}
          autoComplete="new-password"
          required
        />

        {error && <p className="font-mono text-[11px] text-wm-error">{error}</p>}

        <AuthButton type="submit" loading={loading} trailingIcon={<ArrowRight className="h-4 w-4" />}>
          Reset password
        </AuthButton>
      </AuthCard>
    </form>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  )
}
