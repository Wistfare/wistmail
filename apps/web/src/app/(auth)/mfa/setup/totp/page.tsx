'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { QRCodeSVG } from 'qrcode.react'
import { ArrowLeft, ArrowRight, Check, Copy } from 'lucide-react'
import { api } from '@/lib/api-client'
import {
  AuthButton,
  AuthCard,
  AuthHeading,
  OtpInput,
} from '@/components/auth'

type SetupResponse = {
  methodId: string
  secret: string
  otpauthUrl: string
}

type ConfirmResponse = {
  ok: true
  backupCodes: string[] | null
}

const FRESH_BACKUP_KEY = 'wm_fresh_backup_codes'

/**
 * `/mfa/setup/totp` — Pencil reference: `Screen/MFASetupV3-TOTP` (`yYUsl`).
 *
 * Two-column setup card:
 *   left  — 220×220 white-tile QR (radius 12, 12px padding, white bg),
 *           "JBSW Y3DP EHPK 3PXP" 11/700 mono setup key with copy button
 *   right — "Enter the 6 digit code", OtpInput, error, [Cancel · Verify
 *           & continue] CTA row
 *
 * Backend: POST /api/v1/mfa/totp/setup → { methodId, secret, otpauthUrl }
 *          POST /api/v1/mfa/totp/confirm { methodId, code }
 *            → { ok, backupCodes: [10 codes] | null }
 *          When backupCodes is present (first-time enroll), stash them in
 *          sessionStorage and redirect to /mfa/backup-codes; otherwise
 *          go straight to /inbox.
 */
export default function MfaTotpSetupPage() {
  const router = useRouter()
  const [setup, setSetup] = useState<SetupResponse | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [copied, setCopied] = useState(false)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    let cancelled = false
    api
      .post<SetupResponse>('/api/v1/mfa/totp/setup')
      .then((res) => {
        if (!cancelled) setSetup(res)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Could not start setup')
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function copySecret() {
    if (!setup) return
    try {
      await navigator.clipboard.writeText(setup.secret)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard blocked — secret stays visible inline */
    }
  }

  async function verify(c: string) {
    if (!setup) return
    if (c.length < 6) {
      setError('Enter the 6-digit code')
      return
    }
    setVerifying(true)
    setError('')
    try {
      const res = await api.post<ConfirmResponse>('/api/v1/mfa/totp/confirm', {
        methodId: setup.methodId,
        code: c,
      })
      if (res.backupCodes && res.backupCodes.length > 0) {
        sessionStorage.setItem(FRESH_BACKUP_KEY, JSON.stringify(res.backupCodes))
        router.push('/mfa/backup-codes')
      } else {
        router.push('/inbox')
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'That code is incorrect')
    } finally {
      setVerifying(false)
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    await verify(code.replace(/\s+/g, ''))
  }

  return (
    <AuthCard className="max-w-[640px]">
      <AuthHeading
        eyebrow="Security · Step 2"
        title="Set up your authenticator"
        description="Scan the QR code with your authenticator app, then enter the 6-digit code it shows."
      />

      <div
        className="grid w-full gap-6"
        style={{ gridTemplateColumns: 'minmax(0, 240px) 1fr' }}
      >
        {/* QR + manual key. Pencil tileQR: 220×220 white, radius 12,
            padding 12 (so the rendered QR itself is 196×196). */}
        <div className="flex flex-col items-center" style={{ gap: 12 }}>
          <div
            className="relative flex items-center justify-center bg-white"
            style={{ width: 220, height: 220, borderRadius: 12, padding: 12 }}
          >
            {setup ? (
              <QRCodeSVG value={setup.otpauthUrl} size={196} level="M" />
            ) : loadError ? (
              <span
                className="px-2 text-center font-mono"
                style={{ fontSize: 11, color: '#6e6e6e' }}
              >
                {loadError}
              </span>
            ) : (
              <span
                className="font-mono"
                style={{ fontSize: 11, color: '#6e6e6e' }}
              >
                Loading…
              </span>
            )}
          </div>

          {setup && (
            <>
              <span
                aria-label="Manual setup key"
                className="break-all text-center font-mono font-bold"
                style={{
                  fontSize: 11,
                  letterSpacing: 1,
                  color: '#999999',
                  maxWidth: 220,
                }}
              >
                {chunkSecret(setup.secret)}
              </span>
              <button
                type="button"
                onClick={copySecret}
                className="flex items-center gap-1.5 font-mono text-wm-text-tertiary transition-colors hover:text-wm-text-secondary"
                style={{ fontSize: 11 }}
              >
                {copied ? (
                  <>
                    <Check className="h-3 w-3 text-wm-accent" />
                    <span className="text-wm-accent">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" />
                    <span>Copy setup key</span>
                  </>
                )}
              </button>
            </>
          )}
        </div>

        {/* Right column — code entry + CTA row */}
        <form onSubmit={onSubmit} className="flex flex-col" style={{ gap: 16 }}>
          <p
            className="font-mono font-bold uppercase"
            style={{ fontSize: 9, letterSpacing: 1.5, color: '#6e6e6e' }}
          >
            Enter the 6-digit code
          </p>

          <OtpInput
            value={code}
            onChange={setCode}
            onComplete={(c) => verify(c)}
            autoFocus
            status={error ? 'error' : 'default'}
            disabled={!setup}
          />

          {error && (
            <p
              className="font-mono text-wm-error"
              style={{ fontSize: 11 }}
            >
              {error}
            </p>
          )}

          <p
            className="font-mono"
            style={{ fontSize: 11, color: '#6e6e6e' }}
          >
            Codes refresh every 30 seconds.
          </p>

          <div className="mt-2 flex items-center justify-end" style={{ gap: 12 }}>
            <Link
              href="/mfa/setup"
              className="font-mono font-medium text-wm-text-tertiary transition-colors hover:text-wm-text-secondary"
              style={{ fontSize: 11 }}
            >
              Cancel
            </Link>
            <AuthButton
              type="submit"
              loading={verifying}
              disabled={!setup || code.replace(/\s+/g, '').length < 6}
              trailingIcon={<ArrowRight className="h-4 w-4" />}
              className="w-auto px-5"
            >
              Verify &amp; continue
            </AuthButton>
          </div>
        </form>
      </div>

      <Link
        href="/mfa/setup"
        className="flex items-center gap-1.5 self-start font-mono text-wm-text-tertiary transition-colors hover:text-wm-text-secondary"
        style={{ fontSize: 11 }}
      >
        <ArrowLeft className="h-3 w-3" />
        Back to method picker
      </Link>
    </AuthCard>
  )
}

/// Pretty-print a base32 secret as space-separated 4-char groups so
/// users can read it off the QR card without squinting.
function chunkSecret(secret: string): string {
  return secret.replace(/.{4}/g, '$& ').trim()
}
