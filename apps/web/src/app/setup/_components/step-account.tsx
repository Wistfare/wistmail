'use client'

import { useState } from 'react'
import { ArrowRight, Building2, Lock, Mail, User } from 'lucide-react'
import { api } from '@/lib/api-client'
import {
  AuthButton,
  AuthCard,
  AuthHeading,
  AuthInput,
} from '@/components/auth'

interface StepAccountProps {
  domain: string
  onNext: () => void
}

/** Pencil reference: `SetupV3-Account` (`m8JIs`). */
export function StepAccount({ domain, onNext }: StepAccountProps) {
  const [orgName, setOrgName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [emailLocal, setEmailLocal] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const checks = {
    length: password.length >= 8,
    upper: /[A-Z]/.test(password),
    number: /\d/.test(password),
  }

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
    <form onSubmit={onSubmit}>
      <AuthCard>
        <AuthHeading
          eyebrow="Step 3 · Account"
          title="Create your account"
          description={`Set up the admin account for ${domain}. This will be your login email.`}
        />

        <AuthInput
          label="Organization name"
          placeholder="Acme Inc."
          value={orgName}
          onChange={(e) => setOrgName(e.target.value)}
          icon={<Building2 className="h-4 w-4" />}
          autoFocus
          autoComplete="organization"
        />

        <AuthInput
          label="Display name"
          placeholder="Your name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          icon={<User className="h-4 w-4" />}
          autoComplete="name"
          required
        />

        <div className="flex flex-col gap-2">
          <label className="font-mono text-[9px] font-bold uppercase tracking-[1.5px] text-wm-text-tertiary">
            Email address
          </label>
          <div className="flex h-[46px] items-stretch overflow-hidden rounded-[10px] border border-wm-accent bg-wm-surface focus-within:border-wm-accent">
            <span className="flex items-center gap-2.5 pl-3.5 text-wm-text-muted">
              <Mail className="h-4 w-4" />
            </span>
            <input
              type="text"
              value={emailLocal}
              onChange={(e) => setEmailLocal(e.target.value)}
              placeholder="you"
              autoComplete="username"
              className="min-w-0 flex-1 bg-transparent px-3 font-mono text-[13px] text-wm-text-primary placeholder:text-wm-text-muted outline-none"
              required
            />
            <span className="flex items-center border-l border-wm-border bg-wm-bg px-4 font-mono text-[13px] text-wm-text-tertiary">
              @{domain}
            </span>
          </div>
        </div>

        <AuthInput
          label="Password"
          type="password"
          reveal
          placeholder="Minimum 8 characters"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          icon={<Lock className="h-4 w-4" />}
          autoComplete="new-password"
          required
        />

        <div className="flex flex-wrap gap-3 font-mono text-[10px]">
          <span className={checks.length ? 'text-wm-accent' : 'text-wm-text-muted'}>✓ 8+ chars</span>
          <span className={checks.upper ? 'text-wm-accent' : 'text-wm-text-muted'}>✓ Uppercase</span>
          <span className={checks.number ? 'text-wm-accent' : 'text-wm-text-muted'}>✓ Number</span>
        </div>

        {error && <p className="font-mono text-[11px] text-wm-error">{error}</p>}

        <AuthButton type="submit" loading={loading} trailingIcon={<ArrowRight className="h-4 w-4" />}>
          Create account
        </AuthButton>
      </AuthCard>
    </form>
  )
}
