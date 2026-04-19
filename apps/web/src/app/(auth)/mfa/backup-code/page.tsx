'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { KeyRound, ArrowRight } from 'lucide-react'
import { api } from '@/lib/api-client'
import {
  clearPendingMfa,
  readPendingMfa,
  type PendingMfa,
} from '@/lib/mfa-storage'
import { Button } from '@/components/ui/button'

/// Mobile/MfaBackupCode equivalent for web. Submits via the same
/// /auth/login/verify path — the backend dispatcher matches the supplied
/// code against TOTP, email, then backup codes.
export default function MfaBackupCodePage() {
  const router = useRouter()
  const [pending, setPending] = useState<PendingMfa | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const p = readPendingMfa()
    if (!p) {
      router.replace('/login')
      return
    }
    setPending(p)
  }, [router])

  function normalize(v: string) {
    return v.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!pending) return
    const c = normalize(code)
    if (c.length < 8) {
      setError('Enter your 8-character backup code.')
      return
    }
    setLoading(true)
    setError('')
    try {
      type VerifyResponse = { user: { setupComplete: boolean } }
      const res = await api.post<VerifyResponse>('/api/v1/auth/login/verify', {
        pendingToken: pending.pendingToken,
        code: c,
      })
      clearPendingMfa()
      router.push(res.user.setupComplete ? '/inbox' : '/setup')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'That code is incorrect.')
    } finally {
      setLoading(false)
    }
  }

  if (!pending) return null

  return (
    <form onSubmit={submit} className="flex w-full max-w-sm flex-col items-center gap-7">
      <div className="flex h-16 w-16 items-center justify-center bg-wm-accent/10">
        <KeyRound className="h-7 w-7 text-wm-accent" />
      </div>

      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-2xl font-semibold text-wm-text-primary">
          Recovery code
        </h1>
        <p className="font-mono text-xs text-wm-text-tertiary">
          Enter one of your 8-character backup codes.
        </p>
      </div>

      <div className="w-full border border-wm-accent bg-wm-surface px-4 py-3">
        <input
          type="text"
          autoComplete="off"
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="XXXX-XXXX"
          className="w-full bg-transparent text-center font-mono text-lg font-semibold tracking-[0.3em] text-wm-text-primary placeholder:text-wm-text-muted outline-none uppercase"
        />
      </div>

      {error && <p className="font-mono text-xs text-wm-error">{error}</p>}

      <Button
        type="submit"
        size="lg"
        loading={loading}
        icon={<ArrowRight className="h-4 w-4" />}
        className="w-full py-3.5"
      >
        Verify
      </Button>

      <Link
        href="/mfa/challenge"
        className="font-mono text-xs font-semibold text-wm-accent hover:underline"
      >
        Use authenticator instead
      </Link>

      <p className="text-center font-mono text-[11px] text-wm-text-muted">
        Each backup code can only be used once.
      </p>
    </form>
  )
}
