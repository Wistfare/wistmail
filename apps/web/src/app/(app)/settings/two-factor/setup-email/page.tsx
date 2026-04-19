'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, Mail, Send, Info } from 'lucide-react'
import { api } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { InputField } from '@/components/ui/input-field'

export default function EmailSetupPage() {
  const router = useRouter()
  const [step, setStep] = useState<'address' | 'code'>('address')
  const [address, setAddress] = useState('')
  const [methodId, setMethodId] = useState('')
  const [code, setCode] = useState('')
  const [sending, setSending] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState('')

  async function sendCode(e: React.FormEvent) {
    e.preventDefault()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      setError('Enter a valid email address')
      return
    }
    setSending(true)
    setError('')
    try {
      const res = await api.post<{ methodId: string }>('/api/v1/mfa/email/setup', {
        address: address.trim().toLowerCase(),
      })
      setMethodId(res.methodId)
      setStep('code')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not send code')
    } finally {
      setSending(false)
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = code.replace(/\s+/g, '')
    if (trimmed.length < 6) {
      setError('Enter the 6-digit code')
      return
    }
    setVerifying(true)
    setError('')
    try {
      const res = await api.post<{ ok: true; backupCodes: string[] | null }>(
        '/api/v1/mfa/email/verify',
        { methodId, code: trimmed },
      )
      if (res.backupCodes && res.backupCodes.length > 0) {
        sessionStorage.setItem('wm_fresh_backup_codes', JSON.stringify(res.backupCodes))
        router.push('/settings/two-factor/backup-codes')
      } else {
        router.push('/settings/two-factor')
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'That code is incorrect')
    } finally {
      setVerifying(false)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link
          href={step === 'address' ? '/settings/two-factor/setup' : '#'}
          onClick={(e) => {
            if (step !== 'address') {
              e.preventDefault()
              setStep('address')
              setError('')
            }
          }}
          className="flex items-center gap-1.5 font-mono text-[11px] text-wm-text-muted hover:text-wm-text-secondary"
        >
          <ArrowLeft className="h-3 w-3" />
          Back
        </Link>
        <h1 className="text-2xl font-semibold text-wm-text-primary">Backup email</h1>
        <p className="font-mono text-xs text-wm-text-tertiary">
          {step === 'address'
            ? 'Use a different email address than the one on your account.'
            : `We sent a 6-digit code to ${address}. Enter it below.`}
        </p>
      </div>

      <div className="border border-wm-border bg-wm-surface p-6">
        {step === 'address' ? (
          <form onSubmit={sendCode} className="flex flex-col gap-4">
            <InputField
              label="Backup email address"
              type="email"
              autoFocus
              icon={<Mail className="h-[18px] w-[18px]" />}
              placeholder="backup@example.com"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              error={error || undefined}
            />

            <div className="flex items-start gap-2 border border-wm-border bg-wm-bg px-3 py-2.5">
              <Info className="mt-0.5 h-3.5 w-3.5 text-wm-text-muted" />
              <p className="font-mono text-[11px] text-wm-text-tertiary">
                Pick an inbox you can still get into if you lose access here. We&apos;ll only use it for sign-in codes.
              </p>
            </div>

            <div className="flex justify-end">
              <Button
                type="submit"
                size="sm"
                loading={sending}
                icon={<Send className="h-3.5 w-3.5" />}
              >
                Send code
              </Button>
            </div>
          </form>
        ) : (
          <form onSubmit={verify} className="flex flex-col gap-4">
            <div className="flex items-center gap-2.5 border border-wm-accent bg-wm-bg px-4 py-3">
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123 456"
                className="min-w-0 flex-1 bg-transparent text-center font-mono text-xl font-semibold tracking-[0.4em] text-wm-text-primary placeholder:text-wm-text-muted outline-none"
              />
            </div>

            {error && <p className="font-mono text-xs text-wm-error">{error}</p>}

            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault()
                  setStep('address')
                  setCode('')
                  setError('')
                }}
                className="cursor-pointer font-mono text-[11px] text-wm-text-muted hover:text-wm-text-secondary"
              >
                Use a different address
              </button>
              <Button
                type="submit"
                size="sm"
                loading={verifying}
                icon={<ArrowRight className="h-3.5 w-3.5" />}
              >
                Verify
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
