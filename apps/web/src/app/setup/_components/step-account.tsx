'use client'

import { useState } from 'react'
import { User, Mail, Lock, Eye, EyeOff, Building2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api-client'

interface StepAccountProps {
  domain: string
  onNext: () => void
}

export function StepAccount({ domain, onNext }: StepAccountProps) {
  const [displayName, setDisplayName] = useState('')
  const [orgName, setOrgName] = useState('')
  const [emailLocal, setEmailLocal] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const passwordChecks = {
    length: password.length >= 8,
    upper: /[A-Z]/.test(password),
    number: /\d/.test(password),
  }

  async function handleSubmit(e: React.FormEvent) {
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
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <h2 className="text-2xl font-semibold text-wm-text-primary">Create your account</h2>
      <p className="font-mono text-xs text-wm-text-tertiary">
        Set up the admin account for <span className="text-wm-accent">{domain}</span>. This will be your login email.
      </p>

      <div className="flex flex-col gap-2">
        <label className="font-mono text-sm font-medium text-wm-text-secondary">Organization name</label>
        <div className="flex items-center border border-wm-border bg-wm-surface px-4 py-3 focus-within:border-wm-accent">
          <Building2 className="mr-3 h-4 w-4 text-wm-text-muted" />
          <input
            type="text"
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            placeholder="Acme Inc."
            className="min-w-0 flex-1 bg-transparent font-mono text-sm text-wm-text-primary placeholder:text-wm-text-muted outline-none"
            autoFocus
          />
        </div>
        <p className="font-mono text-[10px] text-wm-text-muted">Shown in invitation emails and sender names.</p>
      </div>

      <div className="flex flex-col gap-2">
        <label className="font-mono text-sm font-medium text-wm-text-secondary">Display name</label>
        <div className="flex items-center border border-wm-border bg-wm-surface px-4 py-3 focus-within:border-wm-accent">
          <User className="mr-3 h-4 w-4 text-wm-text-muted" />
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your Name"
            className="min-w-0 flex-1 bg-transparent font-mono text-sm text-wm-text-primary placeholder:text-wm-text-muted outline-none"
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <label className="font-mono text-sm font-medium text-wm-text-secondary">Email address</label>
        <div className="flex items-center border border-wm-border bg-wm-surface focus-within:border-wm-accent">
          <div className="flex flex-1 items-center px-4 py-3">
            <Mail className="mr-3 h-4 w-4 text-wm-text-muted" />
            <input
              type="text"
              value={emailLocal}
              onChange={(e) => setEmailLocal(e.target.value)}
              placeholder="you"
              className="flex-1 bg-transparent font-mono text-sm text-wm-text-primary placeholder:text-wm-text-muted outline-none"
            />
          </div>
          <span className="border-l border-wm-border bg-wm-bg px-4 py-3 font-mono text-sm text-wm-text-muted">
            @{domain}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <label className="font-mono text-sm font-medium text-wm-text-secondary">Password</label>
        <div className="flex items-center border border-wm-border bg-wm-surface px-4 py-3 focus-within:border-wm-accent">
          <Lock className="mr-3 h-4 w-4 text-wm-text-muted" />
          <input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Minimum 8 characters"
            className="flex-1 bg-transparent font-mono text-sm text-wm-text-primary placeholder:text-wm-text-muted outline-none"
          />
          <button type="button" onClick={() => setShowPassword(!showPassword)} className="cursor-pointer text-wm-text-muted">
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <div className="flex gap-3 font-mono text-[10px]">
          <span className={passwordChecks.length ? 'text-wm-accent' : 'text-wm-text-muted'}>&#10003; 8+ chars</span>
          <span className={passwordChecks.upper ? 'text-wm-accent' : 'text-wm-text-muted'}>&#10003; Uppercase</span>
          <span className={passwordChecks.number ? 'text-wm-accent' : 'text-wm-text-muted'}>&#10003; Number</span>
        </div>
      </div>

      {error && <p className="font-mono text-xs text-wm-error">{error}</p>}

      <Button type="submit" variant="primary" loading={loading}>
        Create Account
      </Button>
    </form>
  )
}
