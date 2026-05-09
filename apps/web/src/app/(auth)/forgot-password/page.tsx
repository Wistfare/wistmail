'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, CheckCircle2, Mail } from 'lucide-react'
import { api } from '@/lib/api-client'
import {
  AuthButton,
  AuthCard,
  AuthHeading,
  AuthHeroIcon,
  AuthInput,
} from '@/components/auth'

/** `/forgot-password` — V3 split layout. Backend: `POST /api/v1/auth/forgot-password`. */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  async function onSubmit(e: React.FormEvent) {
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
      // Endpoint returns 200 to prevent enumeration; only network errors land here.
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.')
    } finally {
      setLoading(false)
    }
  }

  if (submitted) {
    return (
      <AuthCard className="items-center text-center">
        <AuthHeroIcon>
          <CheckCircle2 className="h-9 w-9" />
        </AuthHeroIcon>
        <AuthHeading
          eyebrow="Check your inbox"
          title="Reset link sent"
          description={`If an account exists for ${email}, we sent a password reset link. The link expires in 30 minutes.`}
        />
        <p className="font-mono text-[11px] text-wm-text-tertiary">
          Don&apos;t see it? Check spam, or try again with a different address.
        </p>
        <Link
          href="/login"
          className="inline-flex items-center justify-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[1.5px] text-wm-accent hover:underline"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to sign in
        </Link>
      </AuthCard>
    )
  }

  return (
    <form onSubmit={onSubmit} className="w-full">
      <AuthCard>
        <AuthHeading
          eyebrow="Reset password"
          title="Forgot password?"
          description="Enter the email you sign in with and we'll send a reset link."
        />

        <AuthInput
          label="Email address"
          type="email"
          placeholder="you@yourdomain.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={error}
          icon={<Mail className="h-4 w-4" />}
          autoComplete="email"
          autoFocus
          required
        />

        <AuthButton type="submit" loading={loading} trailingIcon={<ArrowRight className="h-4 w-4" />}>
          Send reset link
        </AuthButton>

        <Link
          href="/login"
          className="inline-flex items-center justify-center gap-2 font-mono text-[11px] text-wm-text-tertiary hover:text-wm-text-secondary"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to sign in
        </Link>
      </AuthCard>
    </form>
  )
}
