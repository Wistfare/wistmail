'use client'

import { useState } from 'react'
import { Building2, Eye, EyeOff, Lock, Mail, User } from 'lucide-react'
import { api } from '@/lib/api-client'
import { cn } from '@/lib/utils'

interface StepAccountProps {
  domain: string
  onNext: () => void
}

/**
 * `/setup` step 3 — Pencil reference: `Screen/SetupV3-Account` (`m8JIs`).
 *
 * form (gap 24 vertical):
 *   fHd: "STEP 3 · ACCOUNT" + "Create your account" + desc
 *   orgF, nameF: stacked label + input box (h 46, radius 10, padding [0,14],
 *     gap 10, 1px #1A1A1A border, fill #111, icon 14×14 #6e6e6e + input 13/500 white)
 *   emF: same shell but 1px LIME stroke + LIME mail icon 14×14;
 *     padding [0,16], gap 12, content row:
 *       inWrap (gap 2): "veda" 14/600 white + "|" 15 lime cursor
 *       "@wistmail.com" 14/500 #6e6e6e suffix
 *   pwF: stacked label + input box (h 46, radius 10), lock 14×14 #6e6e6e +
 *     input (•••) 13/500 white + eye 15×15 #6e6e6e trailing toggle
 *   crBtn: 50h, radius 12, lime, "CREATE ACCOUNT" 12/700 black tracking 2
 */
export function StepAccount({ domain, onNext }: StepAccountProps) {
  const [orgName, setOrgName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [emailLocal, setEmailLocal] = useState('')
  const [password, setPassword] = useState('')
  const [reveal, setReveal] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await api.post('/api/v1/setup/account', {
        displayName,
        orgName: orgName.trim() || undefined,
        emailLocal,
        password,
      })
      onNext()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create account')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mx-auto flex w-full max-w-[480px] flex-col"
      style={{ gap: 24 }}
    >
      {/* fHd */}
      <div className="flex w-full flex-col" style={{ gap: 8 }}>
        <p
          className="font-mono font-bold uppercase text-wm-accent"
          style={{ fontSize: 11, letterSpacing: 2 }}
        >
          Step 3 · Account
        </p>
        <h1
          className="font-mono font-bold leading-tight text-wm-text-primary"
          style={{ fontSize: 30 }}
        >
          Create your account
        </h1>
        <p
          className="font-mono font-medium"
          style={{ fontSize: 13, lineHeight: 1.6, color: '#6e6e6e' }}
        >
          Set up the admin account for {domain}. This will be your login email.
        </p>
      </div>

      <SetupField label="Organization name">
        <Building2
          aria-hidden
          style={{ width: 14, height: 14, color: '#6e6e6e' }}
        />
        <input
          type="text"
          value={orgName}
          onChange={(e) => setOrgName(e.target.value)}
          placeholder="Wistfare Mail"
          autoComplete="organization"
          autoFocus
          className="min-w-0 flex-1 bg-transparent font-mono outline-none placeholder:text-wm-text-muted"
          style={{ fontSize: 13, fontWeight: 500, color: '#FFFFFF' }}
        />
      </SetupField>

      <SetupField label="Display name">
        <User aria-hidden style={{ width: 14, height: 14, color: '#6e6e6e' }} />
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Your name"
          autoComplete="name"
          required
          className="min-w-0 flex-1 bg-transparent font-mono outline-none placeholder:text-wm-text-muted"
          style={{ fontSize: 13, fontWeight: 500, color: '#FFFFFF' }}
        />
      </SetupField>

      {/* Email — active state with lime stroke + lime icon, content shows
          local part + @domain.com suffix muted */}
      <div className="flex w-full flex-col" style={{ gap: 8 }}>
        <span
          className="font-mono font-bold uppercase"
          style={{ fontSize: 9, letterSpacing: 1.5, color: '#6e6e6e' }}
        >
          Email address
        </span>
        <div
          className="flex w-full items-center bg-wm-surface"
          style={{
            height: 46,
            borderRadius: 10,
            padding: '0 16px',
            gap: 12,
            border: '1px solid var(--color-wm-accent)',
          }}
        >
          <Mail
            className="text-wm-accent"
            aria-hidden
            style={{ width: 14, height: 14 }}
          />
          <input
            type="text"
            value={emailLocal}
            onChange={(e) =>
              setEmailLocal(
                e.target.value.replace(/[^a-zA-Z0-9._-]/g, '').toLowerCase(),
              )
            }
            placeholder="you"
            autoComplete="username"
            required
            className="min-w-0 flex-1 bg-transparent font-mono outline-none placeholder:text-wm-text-muted"
            style={{ fontSize: 14, fontWeight: 600, color: '#FFFFFF' }}
          />
          <span
            className="font-mono font-medium"
            style={{ fontSize: 14, color: '#6e6e6e' }}
          >
            @{domain}
          </span>
        </div>
      </div>

      <SetupField label="Password">
        <Lock aria-hidden style={{ width: 14, height: 14, color: '#6e6e6e' }} />
        <input
          type={reveal ? 'text' : 'password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••••••"
          autoComplete="new-password"
          required
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
            <EyeOff style={{ width: 15, height: 15 }} />
          ) : (
            <Eye style={{ width: 15, height: 15 }} />
          )}
        </button>
      </SetupField>

      {error && (
        <p className="font-mono text-wm-error" style={{ fontSize: 11 }}>
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className={cn(
          'flex w-full cursor-pointer items-center justify-center font-mono font-bold uppercase',
          'bg-wm-accent text-wm-text-on-accent transition-colors hover:bg-wm-accent-hover',
          'disabled:cursor-not-allowed disabled:opacity-60',
        )}
        style={{
          height: 50,
          borderRadius: 12,
          fontSize: 12,
          letterSpacing: 2,
          boxShadow: '0 6px 24px 0 rgba(191,255,0,0.25)',
        }}
      >
        {loading ? (
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : (
          'Create account'
        )}
      </button>
    </form>
  )
}

function SetupField({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex w-full flex-col" style={{ gap: 8 }}>
      <span
        className="font-mono font-bold uppercase"
        style={{ fontSize: 9, letterSpacing: 1.5, color: '#6e6e6e' }}
      >
        {label}
      </span>
      <div
        className="flex w-full items-center bg-wm-surface"
        style={{
          height: 46,
          borderRadius: 10,
          padding: '0 14px',
          gap: 10,
          border: '1px solid var(--color-wm-border)',
        }}
      >
        {children}
      </div>
    </div>
  )
}
