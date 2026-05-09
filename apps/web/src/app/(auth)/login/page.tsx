'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowRight, KeyRound, Lock, Mail } from 'lucide-react'
import { api } from '@/lib/api-client'
import { writePendingMfa } from '@/lib/mfa-storage'
import {
  AuthButton,
  AuthCard,
  AuthDivider,
  AuthHeading,
  AuthInput,
} from '@/components/auth'

/**
 * `/login` — Pencil `Screen/LoginV3` (`Ar0aI`).
 *
 * Wired to the existing API:
 * - `POST /api/v1/auth/login` returns either `{ user }` or
 *   `{ mfaRequired: true, pendingToken, methods }`.
 *   We forward the user to `/mfa/challenge` for the second step.
 * - SSO is a placeholder (no backend handler today). The button is here
 *   because the design includes it; clicking it surfaces a hint until the
 *   API ships.
 */
export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({})
  const router = useRouter()

  function validate() {
    const next: typeof errors = {}
    if (!email.trim()) next.email = 'Email is required'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) next.email = 'Enter a valid email'
    if (!password) next.password = 'Password is required'
    else if (password.length < 8) next.password = 'At least 8 characters'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    setLoading(true)
    setErrors({})
    try {
      type LoginResponse =
        | { user: { setupComplete: boolean }; mfaRequired?: undefined }
        | {
            mfaRequired: true
            pendingToken: string
            methods: { type: string; label?: string | null }[]
          }
      const res = await api.post<LoginResponse>('/api/v1/auth/login', { email, password })
      if ('mfaRequired' in res && res.mfaRequired) {
        writePendingMfa({ pendingToken: res.pendingToken, methods: res.methods })
        router.push('/mfa/challenge')
        return
      }
      router.push(res.user.setupComplete ? '/inbox' : '/setup')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Invalid email or password'
      setErrors({ form: message })
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="w-full">
      <AuthCard>
        <AuthHeading
          eyebrow="Sign in"
          title="Welcome back"
          description="Enter your credentials to access your inbox."
        />

        {errors.form && (
          <div className="rounded-[10px] border border-wm-error/30 bg-wm-error/10 px-4 py-3">
            <p className="font-mono text-[12px] text-wm-error">{errors.form}</p>
          </div>
        )}

        <AuthInput
          label="Email address"
          type="email"
          placeholder="you@yourdomain.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
          icon={<Mail className="h-4 w-4" />}
          autoComplete="email"
          autoFocus
          required
        />

        <AuthInput
          label="Password"
          type="password"
          reveal
          placeholder="Enter your password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
          icon={<Lock className="h-4 w-4" />}
          autoComplete="current-password"
          required
          trailingLabel={
            <Link
              href="/forgot-password"
              className="font-mono text-[10px] font-bold uppercase tracking-[1.5px] text-wm-accent hover:underline"
            >
              Forgot?
            </Link>
          }
        />

        <AuthButton type="submit" loading={loading} trailingIcon={<ArrowRight className="h-4 w-4" />}>
          Sign in
        </AuthButton>

        <AuthDivider />

        <AuthButton
          type="button"
          variant="secondary"
          icon={<KeyRound className="h-4 w-4" />}
          onClick={() => setErrors({ form: 'SSO is not enabled for this workspace yet.' })}
        >
          Continue with SSO
        </AuthButton>

        <p className="pt-2 text-center font-mono text-[11px] text-wm-text-tertiary">
          First time?{' '}
          <Link href="/setup" className="font-bold text-wm-accent hover:underline">
            Set up your domain →
          </Link>
        </p>
      </AuthCard>
    </form>
  )
}
