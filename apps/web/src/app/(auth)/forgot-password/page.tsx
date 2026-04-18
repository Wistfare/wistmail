'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Mail, ArrowRight, ArrowLeft, CheckCircle2 } from 'lucide-react'
import { api } from '@/lib/api-client'
import { InputField } from '@/components/ui/input-field'
import { Button } from '@/components/ui/button'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Enter a valid email address')
      return
    }
    setLoading(true)
    setError('')
    try {
      await api.post('/api/v1/auth/forgot-password', { email: email.trim() })
      setSubmitted(true)
    } catch (err: unknown) {
      // Endpoint always returns ok to prevent enumeration; only network errors land here.
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.')
    } finally {
      setLoading(false)
    }
  }

  if (submitted) {
    return (
      <div className="flex w-full max-w-sm flex-col gap-7">
        <div className="flex flex-col items-center gap-4 text-center">
          <CheckCircle2 className="h-10 w-10 text-wm-accent" />
          <h1 className="text-2xl font-semibold text-wm-text-primary">Check your email</h1>
          <p className="font-mono text-xs text-wm-text-tertiary">
            If <span className="text-wm-text-secondary">{email}</span> matches an account, we&apos;ve sent a password reset link. The link expires in 30 minutes.
          </p>
          <p className="font-mono text-[11px] text-wm-text-muted">
            Don&apos;t see it? Check spam, or try again with a different address.
          </p>
        </div>
        <Link
          href="/login"
          className="flex items-center justify-center gap-2 font-mono text-xs text-wm-accent hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to sign in
        </Link>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-7">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-wm-text-primary">Forgot password?</h1>
        <p className="font-mono text-xs text-wm-text-tertiary">
          Enter the email you sign in with and we&apos;ll send you a reset link.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <InputField
          label="Email address"
          type="email"
          placeholder="you@yourdomain.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={error}
          icon={<Mail className="h-4.5 w-4.5" />}
          autoComplete="email"
          autoFocus
        />

        <Button
          type="submit"
          size="lg"
          loading={loading}
          icon={<ArrowRight className="h-4 w-4" />}
          className="w-full py-3.5"
        >
          Send reset link
        </Button>

        <Link
          href="/login"
          className="flex items-center justify-center gap-2 font-mono text-xs text-wm-text-muted hover:text-wm-accent"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to sign in
        </Link>
      </div>
    </form>
  )
}
