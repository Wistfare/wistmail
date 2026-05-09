'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronRight, Key, Mail, ShieldCheck, Smartphone } from 'lucide-react'
import { api } from '@/lib/api-client'
import {
  clearPendingMfa,
  readPendingMfa,
  type PendingMfa,
} from '@/lib/mfa-storage'
import { OtpInput } from '@/components/auth'
import { cn } from '@/lib/utils'

/**
 * `/mfa/challenge` — Pencil reference: `Screen/MFAChallengeV3` (`XTWjb`).
 *
 * Card structure (gap 24, width 420):
 *   1. shieldFr — 80×80, cornerRadius 20, bg #1A2200, 1px lime stroke,
 *      lime drop-shadow, lucide shield-check 36×36 lime inside
 *   2. "TWO-FACTOR · REQUIRED" — JetBrains Mono 11/700 lime tracking 2
 *   3. cTitle (gap 6 vertical):
 *      "Verify it's you" — 28/700 white
 *      "Enter the 6-digit code …" — 12/500 #6e6e6e
 *   4. codeWrap (gap 8 vertical):
 *      codeRow — 6 cells (see OtpInput) gap 8 justify center
 *      hint — smartphone 11×11 + "AUTHY · OPENED 12s AGO" 9/700 #6e6e6e tracking 1.5
 *   5. verBtn — h 48 radius 12 lime, "VERIFY" 12/700 black tracking 2 (no icon)
 *   6. altSec — radius 12 bg #111 1px #1A1A1A border, padding 6, vertical
 *      alt1 — key 14×14 lime + ("Use a backup code" / 10/500 desc) + chevron
 *      divA — 1px hairline #1A1A1A
 *      alt2 — mail 14×14 #999 + ("Email me a code …" / 10/500 desc) + chevron
 *
 * Backend: `POST /api/v1/auth/login/verify` accepts the 6-digit code or
 * a backup code. `POST /api/v1/auth/login/email-code` triggers the
 * email-code path.
 */
export default function MfaChallengePage() {
  const router = useRouter()
  const [pending, setPending] = useState<PendingMfa | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [emailSending, setEmailSending] = useState(false)
  const [emailSent, setEmailSent] = useState(false)

  useEffect(() => {
    const p = readPendingMfa()
    if (!p) {
      router.replace('/login')
      return
    }
    setPending(p)
  }, [router])

  const hasTotp = pending?.methods.some((m) => m.type === 'totp') ?? false
  const hasEmail = pending?.methods.some((m) => m.type === 'email') ?? false

  /// Pencil `h7eCT` hint copy: "AUTHY · OPENED 12s AGO" — exact wording
  /// from the design.  When the user only has the email factor, swap to
  /// the equivalent "EMAIL CODE · CHECK YOUR INBOX" copy in the same
  /// 9/700 #6e6e6e tracking 1.5 treatment so the line still matches the
  /// design's hint slot.
  const hintLabel = hasTotp
    ? 'Authy · opened 12s ago'
    : 'Email code · check your inbox'

  const subtitle = useMemo(
    () =>
      hasTotp
        ? "Enter the 6-digit code from your authenticator app."
        : "Enter the 6-digit code we sent to your backup email.",
    [hasTotp],
  )

  async function verify(c: string) {
    if (!pending) return
    if (c.length < 6) {
      setError('Enter the 6-digit code')
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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    await verify(code.replace(/\s+/g, ''))
  }

  async function sendEmailCode() {
    if (!pending) return
    setEmailSending(true)
    setError('')
    try {
      await api.post('/api/v1/auth/login/email-code', {
        pendingToken: pending.pendingToken,
      })
      setEmailSent(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not send email code.')
    } finally {
      setEmailSending(false)
    }
  }

  if (!pending) return null

  return (
    <form
      onSubmit={onSubmit}
      // Pencil card: width 420, gap 24, vertical, alignItems center.
      className="mx-auto flex w-full max-w-[420px] flex-col items-center"
      style={{ gap: 24 }}
    >
      {/* (1) shieldFr — Pencil `JXNoc`: 80×80, cornerRadius 20,
            bg #1A2200, 1px lime stroke, lucide shield-check 36×36 lime.
            No shadow in Pencil. */}
      <div
        className="flex items-center justify-center"
        style={{
          width: 80,
          height: 80,
          borderRadius: 20,
          background: 'var(--color-wm-accent-dim)',
          border: '1px solid var(--color-wm-accent)',
        }}
      >
        <ShieldCheck
          aria-hidden
          className="text-wm-accent"
          style={{ width: 36, height: 36 }}
        />
      </div>

      {/* (2) eyebrow */}
      <p
        className="font-mono font-bold uppercase text-wm-accent"
        style={{ fontSize: 11, letterSpacing: 2 }}
      >
        Two-factor · required
      </p>

      {/* (3) cTitle — title + description, gap 6 vertical */}
      <div className="flex w-full flex-col items-center text-center" style={{ gap: 6 }}>
        <h1
          className="font-mono font-bold leading-tight text-wm-text-primary"
          style={{ fontSize: 28 }}
        >
          Verify it&rsquo;s you
        </h1>
        <p
          className="font-mono font-medium"
          style={{ fontSize: 12, color: '#6e6e6e' }}
        >
          {subtitle}
        </p>
      </div>

      {/* (4) codeWrap */}
      <div className="flex w-full flex-col items-center" style={{ gap: 8 }}>
        <OtpInput
          value={code}
          onChange={setCode}
          onComplete={(c) => verify(c)}
          autoFocus
          status={error ? 'error' : 'default'}
        />
        {/* hint: smartphone 11px icon + caption */}
        <div
          className="flex items-center justify-center"
          style={{ gap: 6, paddingTop: 4 }}
        >
          <Smartphone
            aria-hidden
            style={{ width: 11, height: 11, color: '#6e6e6e' }}
          />
          <span
            className="font-mono font-bold uppercase"
            style={{ fontSize: 9, letterSpacing: 1.5, color: '#6e6e6e' }}
          >
            {hintLabel}
          </span>
        </div>
      </div>

      {error && (
        <p
          className="text-center font-mono text-wm-error"
          style={{ fontSize: 11 }}
        >
          {error}
        </p>
      )}
      {emailSent && !error && (
        <p
          className="text-center font-mono text-wm-accent"
          style={{ fontSize: 11 }}
        >
          Code sent. Check your backup email.
        </p>
      )}

      {/* (5) verBtn */}
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
          'Verify'
        )}
      </button>

      {/* (6) altSec — fill #111, 1px #1A1A1A, padding 6, two rows + 1px divider */}
      <div
        className="w-full bg-wm-surface"
        style={{
          borderRadius: 12,
          padding: 6,
          border: '1px solid var(--color-wm-border)',
        }}
      >
        <AltRow
          icon={<Key className="text-wm-accent" style={{ width: 14, height: 14 }} aria-hidden />}
          title="Use a backup code"
          description="One of the 10 codes from your recovery sheet"
          href="/mfa/backup-code"
        />
        {/* divA — Pencil `TkxT5`: 1px height, fill #1A1A1A, full inner
            container width.  No horizontal inset beyond the 6-px altSec
            padding the parent already provides. */}
        <div
          aria-hidden
          style={{
            height: 1,
            background: 'var(--color-wm-border)',
          }}
        />
        {hasEmail && hasTotp ? (
          <button
            type="button"
            onClick={sendEmailCode}
            disabled={emailSending}
            className="block w-full text-left disabled:opacity-50"
          >
            <AltRow
              icon={
                <Mail
                  style={{ width: 14, height: 14, color: '#999999' }}
                  aria-hidden
                />
              }
              title={emailSending ? 'Sending email…' : 'Email me a code instead'}
              description={`Sent to ${maskEmail(pending.methods.find((m) => m.type === 'email')?.label ?? null)}`}
              asLink={false}
            />
          </button>
        ) : (
          <AltRow
            icon={
              <Mail
                style={{ width: 14, height: 14, color: '#999999' }}
                aria-hidden
              />
            }
            title="Email me a code instead"
            description="Available when you set up an email backup factor"
            disabled
          />
        )}
      </div>

      {/* Pencil's MFAChallengeV3 does not include a "back to sign in"
          link below the altSec — the user can navigate back via the
          browser. We deliberately omit it so the card matches the
          design exactly. */}
    </form>
  )
}

/**
 * One row inside `altSec`. Pencil `alt1` / `alt2`:
 *   cornerRadius 8, padding [10, 12], gap 10, alignItems center
 *   [icon 14] [title 12/600 white + desc 10/500 #6e6e6e stack] [chevron 14 #6e6e6e]
 */
function AltRow({
  icon,
  title,
  description,
  href,
  asLink = true,
  disabled,
}: {
  icon: React.ReactNode
  title: string
  description: string
  href?: string
  /** When false (used for the email-code button), render content only. */
  asLink?: boolean
  disabled?: boolean
}) {
  const inner = (
    <div
      className={cn(
        'flex items-center transition-colors',
        !disabled && asLink && 'hover:bg-wm-surface-hover',
        disabled && 'opacity-60',
      )}
      style={{ borderRadius: 8, padding: '10px 12px', gap: 10 }}
    >
      {icon}
      <div className="flex flex-1 flex-col" style={{ gap: 1 }}>
        <span
          className="font-mono font-semibold text-wm-text-primary"
          style={{ fontSize: 12 }}
        >
          {title}
        </span>
        <span
          className="font-mono font-medium"
          style={{ fontSize: 10, color: '#6e6e6e' }}
        >
          {description}
        </span>
      </div>
      <ChevronRight
        aria-hidden
        style={{ width: 14, height: 14, color: '#6e6e6e' }}
      />
    </div>
  )
  if (asLink && href && !disabled) {
    return (
      <Link href={href} className="block cursor-pointer">
        {inner}
      </Link>
    )
  }
  return inner
}

/** "veda@wistmail.com" → "v•••@wistmail.com" — mirrors Pencil's masking. */
function maskEmail(label: string | null | undefined): string {
  if (!label) return 'your backup email'
  const at = label.indexOf('@')
  if (at <= 0) return label
  const local = label.slice(0, at)
  const domain = label.slice(at)
  return `${local[0]}•••${domain}`
}
