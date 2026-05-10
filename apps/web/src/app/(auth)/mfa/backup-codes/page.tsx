'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Copy,
  Download,
  KeyRound,
  RefreshCcw,
} from 'lucide-react'
import { api } from '@/lib/api-client'
import {
  AuthButton,
  AuthCard,
  AuthHeading,
  AuthHeroIcon,
} from '@/components/auth'

const FRESH_BACKUP_KEY = 'wm_fresh_backup_codes'

/**
 * `/mfa/backup-codes` — Pencil reference: `Screen/MFASetupV3-Codes` (`A6tHu`).
 *
 * Display the freshly-generated 10 backup codes. We pull them from
 * sessionStorage where the previous step (TOTP / email confirm) stashed
 * them — they cannot be re-fetched from the API after this page is
 * dismissed because the codes are stored hashed only.
 *
 * Layout (gap 24 vertical, width 420):
 *   1. KeyRound hero icon
 *   2. heading + description "Save these now…"
 *   3. warnRow  — red banner: "These can't be shown again"
 *   4. codesGrid — 5 rows × 2 cols of "0001-XXXX" tiles, mono 13/700
 *   5. actionRow — [Copy all] [Download .txt]   [Regenerate]
 *   6. CTA      — primary "I've saved them safely"
 */
export default function MfaBackupCodesPage() {
  const router = useRouter()
  const [codes, setCodes] = useState<string[]>([])
  const [copied, setCopied] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const raw = sessionStorage.getItem(FRESH_BACKUP_KEY)
    if (!raw) {
      router.replace('/inbox')
      return
    }
    try {
      const parsed = JSON.parse(raw) as string[]
      if (!Array.isArray(parsed) || parsed.length === 0) {
        router.replace('/inbox')
        return
      }
      setCodes(parsed)
    } catch {
      router.replace('/inbox')
    }
  }, [router])

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(codes.join('\n'))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard blocked */
    }
  }

  function download() {
    const blob = new Blob([codes.join('\n') + '\n'], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'wistfare-mail-backup-codes.txt'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  async function regenerate() {
    if (
      !confirm(
        'Generate new backup codes? Your existing codes will stop working immediately.',
      )
    ) {
      return
    }
    setRegenerating(true)
    setError('')
    try {
      const res = await api.post<{ codes: string[] }>(
        '/api/v1/mfa/backup-codes/regenerate',
      )
      sessionStorage.setItem(FRESH_BACKUP_KEY, JSON.stringify(res.codes))
      setCodes(res.codes)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not regenerate codes')
    } finally {
      setRegenerating(false)
    }
  }

  function done() {
    sessionStorage.removeItem(FRESH_BACKUP_KEY)
    router.push('/inbox')
  }

  if (codes.length === 0) return null

  return (
    <AuthCard className="max-w-[520px]">
      <AuthHeroIcon>
        <KeyRound className="h-9 w-9" />
      </AuthHeroIcon>
      <AuthHeading
        eyebrow="Security · Recovery"
        title="Save these codes"
        description="Use one if you ever lose access to your authenticator. Each code works exactly once."
      />

      {/* Warning banner — Pencil warnRow: bg #2A0808 / 1px #FF4444 / radius 10
          / padding [10, 12] / gap 8 / 11/700 #FF4444 left-aligned. */}
      <div
        className="flex items-start gap-2"
        style={{
          padding: '10px 12px',
          borderRadius: 10,
          background: 'rgba(255, 68, 68, 0.08)',
          border: '1px solid rgba(255, 68, 68, 0.4)',
        }}
      >
        <AlertTriangle
          aria-hidden
          className="text-wm-error"
          style={{ width: 14, height: 14, marginTop: 2 }}
        />
        <p
          className="font-mono font-semibold text-wm-error"
          style={{ fontSize: 11, lineHeight: 1.5 }}
        >
          These can&rsquo;t be shown again. Store them somewhere safe before you continue.
        </p>
      </div>

      {/* codesGrid — 2-col grid, gap 8, code tiles 13/700 mono on bg #111. */}
      <div
        className="grid w-full"
        style={{ gridTemplateColumns: '1fr 1fr', gap: 8 }}
      >
        {codes.map((code, i) => (
          <div
            key={i}
            className="flex items-center bg-wm-surface"
            style={{
              padding: '10px 12px',
              borderRadius: 8,
              border: '1px solid var(--color-wm-border)',
              gap: 10,
            }}
          >
            <span
              className="font-mono"
              style={{ fontSize: 10, color: '#6e6e6e' }}
            >
              {String(i + 1).padStart(2, '0')}
            </span>
            <span
              className="font-mono font-bold text-wm-text-primary"
              style={{ fontSize: 13, letterSpacing: 1.5 }}
            >
              {code}
            </span>
          </div>
        ))}
      </div>

      {error && (
        <p
          className="text-center font-mono text-wm-error"
          style={{ fontSize: 11 }}
        >
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <AuthButton
          type="button"
          variant="secondary"
          icon={
            copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />
          }
          onClick={copyAll}
          className="w-auto flex-1 px-3"
        >
          {copied ? 'Copied' : 'Copy all'}
        </AuthButton>
        <AuthButton
          type="button"
          variant="secondary"
          icon={<Download className="h-3.5 w-3.5" />}
          onClick={download}
          className="w-auto flex-1 px-3"
        >
          Download .txt
        </AuthButton>
        <AuthButton
          type="button"
          variant="ghost"
          icon={<RefreshCcw className="h-3.5 w-3.5" />}
          onClick={regenerate}
          loading={regenerating}
          className="w-auto px-3"
        >
          Regenerate
        </AuthButton>
      </div>

      <AuthButton
        type="button"
        onClick={done}
        trailingIcon={<ArrowRight className="h-4 w-4" />}
      >
        I&rsquo;ve saved them safely
      </AuthButton>
    </AuthCard>
  )
}
