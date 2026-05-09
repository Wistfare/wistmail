'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Eye, EyeOff, Lock, Mail } from 'lucide-react'
import { api } from '@/lib/api-client'
import { writePendingMfa } from '@/lib/mfa-storage'
import { cn } from '@/lib/utils'

/**
 * `/login` — Pencil reference: `Screen/LoginV3` (`Ar0aI`).
 *
 * Card structure (gap 24, width 420):
 *   1. "SIGN IN" eyebrow            — JetBrains Mono 11/700, lime, tracking 2
 *   2. cTitle (gap 6 vertical)
 *        "Welcome back"             — JetBrains Mono 28/700, white
 *        "Enter your credentials …" — JetBrains Mono 12/500, #6e6e6e
 *   3. fEmail
 *        "EMAIL ADDRESS" label      — JetBrains Mono 9/700, #6e6e6e, tracking 1.5
 *        f1Box (h 46, radius 10)    — bg #111, 1px #1A1A1A border
 *          mail icon 14×14 #6e6e6e
 *          input
 *   4. fPwd
 *        f2H (space-between)
 *          "PASSWORD"               — same as email label
 *          "FORGOT PASSWORD?"       — 9/700, lime, tracking 1
 *        f2Box (h 46, radius 10)    — bg #111, 1px LIME border (active state)
 *          lock icon 14×14 lime
 *          input
 *          eye icon 15×15 #6e6e6e
 *   5. signBtn (h 48, radius 12)    — bg lime, "SIGN IN" 12/700 black, lime drop-shadow
 *   6. foot (justify center, gap 6)
 *        "First time?"              — JetBrains Mono 11/500, #6e6e6e
 *        "Set up your domain"       — JetBrains Mono 11/700, lime
 *
 * Backend: `POST /api/v1/auth/login` returns either `{ user }` or
 * `{ mfaRequired: true, pendingToken, methods }` — we route the latter
 * to `/mfa/challenge`. (The Pencil frame has no SSO button or divider;
 * those have been removed accordingly.)
 */
export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [reveal, setReveal] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<{
    email?: string
    password?: string
    form?: string
  }>({})

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
    <form
      onSubmit={onSubmit}
      // Pencil card: width 420, gap 24, vertical layout.
      className="mx-auto flex w-full max-w-[420px] flex-col"
      style={{ gap: 24 }}
    >
      {/* (1) eyebrow */}
      <p
        className="font-mono font-bold uppercase text-wm-accent"
        style={{ fontSize: 11, letterSpacing: 2 }}
      >
        Sign in
      </p>

      {/* (2) cTitle: title + description, internal gap 6 */}
      <div className="flex flex-col" style={{ gap: 6 }}>
        <h1
          className="font-mono font-bold leading-tight text-wm-text-primary"
          style={{ fontSize: 28 }}
        >
          Welcome back
        </h1>
        <p
          className="font-mono font-medium"
          style={{ fontSize: 12, color: '#6e6e6e' }}
        >
          Enter your credentials to access your inbox.
        </p>
      </div>

      {/* form-level error */}
      {errors.form && (
        <div className="rounded-[10px] border border-wm-error/30 bg-wm-error/10 px-4 py-3">
          <p className="font-mono text-[12px] text-wm-error">{errors.form}</p>
        </div>
      )}

      {/* (3) fEmail */}
      <FieldShell label="Email address" error={errors.email}>
        <Mail className="h-[14px] w-[14px] shrink-0" style={{ color: '#6e6e6e' }} />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@yourdomain.com"
          autoComplete="email"
          required
          className={cn(
            'min-w-0 flex-1 bg-transparent font-mono outline-none',
            'placeholder:text-wm-text-muted',
          )}
          style={{ fontSize: 13, fontWeight: 500, color: '#FFFFFF' }}
        />
      </FieldShell>

      {/* (4) fPwd */}
      <FieldShell
        label="Password"
        error={errors.password}
        trailingLabel={
          <Link
            href="/forgot-password"
            className="font-mono font-bold uppercase text-wm-accent hover:underline"
            style={{ fontSize: 9, letterSpacing: 1 }}
          >
            Forgot password?
          </Link>
        }
      >
        <Lock
          className="h-[14px] w-[14px] shrink-0"
          aria-hidden
          style={{ color: '#6e6e6e' }}
        />
        <input
          type={reveal ? 'text' : 'password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
          placeholder="••••••••••••"
          className="min-w-0 flex-1 bg-transparent font-mono outline-none placeholder:text-wm-text-muted"
          style={{ fontSize: 13, fontWeight: 500, color: '#FFFFFF' }}
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setReveal((v) => !v)}
          aria-label={reveal ? 'Hide password' : 'Show password'}
          className="cursor-pointer"
          style={{ color: '#6e6e6e' }}
        >
          {reveal ? (
            <EyeOff className="h-[15px] w-[15px]" />
          ) : (
            <Eye className="h-[15px] w-[15px]" />
          )}
        </button>
      </FieldShell>

      {/* (5) signBtn */}
      <button
        type="submit"
        disabled={loading}
        className={cn(
          'flex w-full cursor-pointer items-center justify-center font-mono font-bold uppercase',
          'bg-wm-accent text-wm-text-on-accent transition-colors hover:bg-wm-accent-hover',
          'disabled:cursor-not-allowed disabled:opacity-60',
        )}
        style={{
          height: 48,
          borderRadius: 12,
          fontSize: 12,
          letterSpacing: 2,
          // Pencil shadow: blur 24, color #BFFF0040, offset y=6.
          boxShadow: '0 6px 24px 0 rgba(191,255,0,0.25)',
        }}
      >
        {loading ? (
          <svg
            className="h-4 w-4 animate-spin"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
        ) : (
          'Sign in'
        )}
      </button>

      {/* (6) foot */}
      <div
        className="flex items-center justify-center"
        style={{ gap: 6, paddingTop: 8 }}
      >
        <span
          className="font-mono font-medium"
          style={{ fontSize: 11, color: '#6e6e6e' }}
        >
          First time?
        </span>
        <Link
          href="/setup"
          className="font-mono font-bold text-wm-accent hover:underline"
          style={{ fontSize: 11 }}
        >
          Set up your domain
        </Link>
      </div>
    </form>
  )
}

/**
 * Pencil `fEmail` / `fPwd` shell:
 *   stacked label + input box
 *
 * Header row:
 *   - default: just the label
 *   - with `trailingLabel`: justify space-between (label + trailing)
 *
 * Input box:
 *   - cornerRadius 10, height 46, bg #111111, padding [0, 14], gap 10
 *   - border defaults to #1A1A1A (idle) and flips to lime via
 *     `focus-within:border-wm-accent` while a child input is focused.
 *     The Pencil mock shows the password row with the lime stroke
 *     because the user is actively typing in it — there is no separate
 *     "active" state independent of focus, so the styling is purely
 *     focus-driven.  Errors override both with the error palette.
 */
function FieldShell({
  label,
  trailingLabel,
  error,
  children,
}: {
  label: string
  trailingLabel?: React.ReactNode
  error?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex w-full flex-col" style={{ gap: 8 }}>
      {/* header row */}
      {trailingLabel ? (
        <div className="flex items-center justify-between">
          <FieldLabel>{label}</FieldLabel>
          {trailingLabel}
        </div>
      ) : (
        <FieldLabel>{label}</FieldLabel>
      )}

      {/* input box — Pencil f1Box / f2Box. Tailwind owns the border
          colour so the focus-within rule actually applies; an inline
          `borderColor` would beat the class and pin the colour. */}
      <div
        className={cn(
          'flex w-full items-center border bg-wm-surface transition-colors',
          error
            ? 'border-wm-error focus-within:border-wm-error'
            : 'border-wm-border focus-within:border-wm-accent',
        )}
        style={{
          height: 46,
          borderRadius: 10,
          padding: '0 14px',
          gap: 10,
        }}
      >
        {children}
      </div>

      {error && (
        <p className="font-mono text-wm-error" style={{ fontSize: 11 }}>
          {error}
        </p>
      )}
    </div>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  // Pencil label: JetBrains Mono 9px 700 letterSpacing 1.5 #6e6e6e UPPERCASE.
  return (
    <span
      className="font-mono font-bold uppercase"
      style={{ fontSize: 9, letterSpacing: 1.5, color: '#6e6e6e' }}
    >
      {children}
    </span>
  )
}
