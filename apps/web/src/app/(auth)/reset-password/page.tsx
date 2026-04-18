'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Lock, Eye, EyeOff, ArrowRight, CheckCircle2, AlertTriangle } from 'lucide-react'
import { api } from '@/lib/api-client'
import { Button } from '@/components/ui/button'

function ResetPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token') || ''

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

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
      <div className="flex w-full max-w-sm flex-col items-center gap-4 text-center">
        <AlertTriangle className="h-10 w-10 text-wm-error" />
        <h1 className="text-2xl font-semibold text-wm-text-primary">Invalid link</h1>
        <p className="font-mono text-xs text-wm-text-tertiary">
          This reset link is missing its token. Request a new one.
        </p>
        <Link
          href="/forgot-password"
          className="font-mono text-xs text-wm-accent hover:underline"
        >
          Request a new link
        </Link>
      </div>
    )
  }

  if (done) {
    return (
      <div className="flex w-full max-w-sm flex-col items-center gap-4 text-center">
        <CheckCircle2 className="h-10 w-10 text-wm-accent" />
        <h1 className="text-2xl font-semibold text-wm-text-primary">Password updated</h1>
        <p className="font-mono text-xs text-wm-text-tertiary">
          Your password has been reset. Sign in with your new password.
        </p>
        <Button
          size="lg"
          icon={<ArrowRight className="h-4 w-4" />}
          onClick={() => router.push('/login')}
          className="w-full py-3.5"
        >
          Go to sign in
        </Button>
      </div>
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!allOk) {
      setError('Password does not meet the requirements')
      return
    }
    if (!matches) {
      setError('Passwords do not match')
      return
    }
    setLoading(true)
    setError('')
    try {
      await api.post('/api/v1/auth/reset-password', { token, newPassword: password })
      setDone(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not reset password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-7">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-wm-text-primary">Choose a new password</h1>
        <p className="font-mono text-xs text-wm-text-tertiary">
          Pick something strong — at least 8 chars with an uppercase letter and a number.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label className="font-mono text-xs font-medium text-wm-text-secondary">New password</label>
          <div className="flex items-center gap-2.5 border border-wm-border bg-wm-surface px-4 py-3 focus-within:border-wm-accent">
            <Lock className="h-4.5 w-4.5 text-wm-text-muted" />
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              autoFocus
              className="min-w-0 flex-1 bg-transparent font-mono text-sm text-wm-text-primary placeholder:text-wm-text-muted outline-none"
              placeholder="Enter a new password"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="cursor-pointer text-wm-text-muted hover:text-wm-text-secondary"
            >
              {showPassword ? <Eye className="h-4.5 w-4.5" /> : <EyeOff className="h-4.5 w-4.5" />}
            </button>
          </div>
          <div className="flex flex-wrap gap-3 font-mono text-[10px]">
            <span className={checks.length ? 'text-wm-accent' : 'text-wm-text-muted'}>&#10003; 8+ chars</span>
            <span className={checks.upper ? 'text-wm-accent' : 'text-wm-text-muted'}>&#10003; Uppercase</span>
            <span className={checks.lower ? 'text-wm-accent' : 'text-wm-text-muted'}>&#10003; Lowercase</span>
            <span className={checks.number ? 'text-wm-accent' : 'text-wm-text-muted'}>&#10003; Number</span>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label className="font-mono text-xs font-medium text-wm-text-secondary">Confirm password</label>
          <div className="flex items-center gap-2.5 border border-wm-border bg-wm-surface px-4 py-3 focus-within:border-wm-accent">
            <Lock className="h-4.5 w-4.5 text-wm-text-muted" />
            <input
              type={showPassword ? 'text' : 'password'}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              className="min-w-0 flex-1 bg-transparent font-mono text-sm text-wm-text-primary placeholder:text-wm-text-muted outline-none"
              placeholder="Re-enter your new password"
            />
          </div>
        </div>

        {error && <p className="font-mono text-xs text-wm-error">{error}</p>}

        <Button
          type="submit"
          size="lg"
          loading={loading}
          icon={<ArrowRight className="h-4 w-4" />}
          className="w-full py-3.5"
        >
          Reset password
        </Button>
      </div>
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
