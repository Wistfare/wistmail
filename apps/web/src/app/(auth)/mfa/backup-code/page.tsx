'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowRight, KeyRound } from 'lucide-react'
import { api } from '@/lib/api-client'
import {
  clearPendingMfa,
  readPendingMfa,
  type PendingMfa,
} from '@/lib/mfa-storage'
import {
  AuthButton,
  AuthCard,
  AuthHeading,
  AuthHeroIcon,
  AuthInput,
} from '@/components/auth'

/**
 * `/mfa/backup-code` — alternative path from /mfa/challenge. The user
 * pastes one of their 8-character backup codes; the backend dispatcher
 * accepts it on the same `POST /api/v1/auth/login/verify` endpoint.
 */
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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!pending) return
    const c = normalize(code)
    if (c.length < 8) {
      setError('Enter your 8-character backup code')
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
    <form onSubmit={onSubmit} className="w-full">
      <AuthCard className="items-stretch">
        <AuthHeroIcon>
          <KeyRound className="h-9 w-9" />
        </AuthHeroIcon>
        <AuthHeading
          eyebrow="Recovery"
          title="Use a backup code"
          description="Enter one of your 8-character backup codes. Each code can only be used once."
        />

        <AuthInput
          label="Backup code"
          placeholder="XXXX-XXXX"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          error={error}
          autoComplete="off"
          autoFocus
          maxLength={9}
          spellCheck={false}
          className="text-center tracking-[0.3em]"
        />

        <AuthButton type="submit" loading={loading} trailingIcon={<ArrowRight className="h-4 w-4" />}>
          Verify
        </AuthButton>

        <Link
          href="/mfa/challenge"
          className="text-center font-mono text-[11px] font-bold uppercase tracking-[1.5px] text-wm-accent hover:underline"
        >
          ← Use authenticator instead
        </Link>
      </AuthCard>
    </form>
  )
}
