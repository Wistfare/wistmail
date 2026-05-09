'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, Clock, Loader2 } from 'lucide-react'
import { api } from '@/lib/api-client'
import {
  AuthButton,
  AuthCard,
  AuthHeading,
} from '@/components/auth'
import { cn } from '@/lib/utils'

type DnsStatus = { mx: boolean; spf: boolean; dkim: boolean; dmarc: boolean; verified: boolean }

interface StepDnsVerificationProps {
  onNext: () => void
  onBack: () => void
}

const RECORDS = [
  { key: 'mx' as const, label: 'MX', desc: 'Mail exchange' },
  { key: 'spf' as const, label: 'SPF', desc: 'Sender policy framework' },
  { key: 'dkim' as const, label: 'DKIM', desc: 'DomainKeys identified mail' },
  { key: 'dmarc' as const, label: 'DMARC', desc: 'Domain-based message auth' },
]

/** Pencil reference: `SetupV3-DNS-Verify` (`u5uqW`). */
export function StepDnsVerification({ onNext, onBack }: StepDnsVerificationProps) {
  const [dns, setDns] = useState<DnsStatus | null>(null)
  const [polling, setPolling] = useState(true)
  const [elapsed, setElapsed] = useState(0)
  const [timedOut, setTimedOut] = useState(false)
  const startedAt = useRef(Date.now())

  useEffect(() => {
    if (!polling) return
    async function check() {
      try {
        const res = await api.post<DnsStatus>('/api/v1/setup/domain/verify')
        setDns(res)
        if (res.verified) setPolling(false)
      } catch {
        /* ignore — keep polling */
      }
    }
    check()
    const pollId = setInterval(check, 10_000)
    const tickId = setInterval(() => {
      const s = Math.floor((Date.now() - startedAt.current) / 1000)
      setElapsed(s)
      if (s > 1800) {
        setTimedOut(true)
        setPolling(false)
      }
    }, 1000)
    return () => {
      clearInterval(pollId)
      clearInterval(tickId)
    }
  }, [polling])

  const verifiedCount = dns
    ? [dns.mx, dns.spf, dns.dkim, dns.dmarc].filter(Boolean).length
    : 0
  const minutes = Math.floor(elapsed / 60)
  const seconds = elapsed % 60
  const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`

  return (
    <AuthCard>
      <AuthHeading
        eyebrow="Step 2 · DNS · Verifying"
        title="Verifying DNS records"
        description="Checking DNS propagation. This usually takes a few minutes."
      />

      <div className="flex flex-col gap-3 rounded-[12px] border border-wm-border bg-wm-surface px-5 py-4">
        <div className="flex items-baseline justify-between">
          <span className="font-mono text-[11px] font-bold uppercase tracking-[1.5px] text-wm-text-secondary">
            {verifiedCount}/4 records verified
          </span>
          <span className="font-mono text-[11px] text-wm-text-tertiary">{timeStr} elapsed</span>
        </div>
        <div className="h-1 w-full overflow-hidden bg-wm-bg">
          <div
            className="h-full bg-wm-accent transition-all duration-500"
            style={{ width: `${(verifiedCount / 4) * 100}%` }}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {RECORDS.map((r) => {
          const ok = dns?.[r.key] ?? false
          return (
            <div
              key={r.key}
              className={cn(
                'flex items-center gap-3 rounded-[10px] border px-4 py-3 transition-colors',
                ok ? 'border-wm-accent/40 bg-wm-accent-dim' : 'border-wm-border bg-wm-surface',
              )}
            >
              <span className="flex h-7 w-7 items-center justify-center" aria-hidden>
                {ok ? (
                  <Check className="h-4 w-4 text-wm-accent" />
                ) : polling ? (
                  <Loader2 className="h-4 w-4 animate-spin text-wm-text-tertiary" />
                ) : (
                  <Clock className="h-4 w-4 text-wm-warning" />
                )}
              </span>
              <span className="flex flex-1 flex-col">
                <span className="font-mono text-[12px] font-bold text-wm-text-primary">
                  {r.label}
                </span>
                <span className="font-mono text-[10px] text-wm-text-tertiary">{r.desc}</span>
              </span>
              <span
                className={cn(
                  'font-mono text-[10px] font-bold uppercase tracking-[1.5px]',
                  ok ? 'text-wm-accent' : 'text-wm-warning',
                )}
              >
                {ok ? 'Verified' : 'Pending'}
              </span>
            </div>
          )
        })}
      </div>

      {timedOut && (
        <div className="rounded-[12px] border border-wm-warning/30 bg-wm-warning/5 px-4 py-3">
          <p className="font-mono text-[11px] text-wm-warning">
            DNS propagation is taking longer than expected. Check that all records are saved at
            your provider.
          </p>
          <button
            type="button"
            onClick={() => {
              startedAt.current = Date.now()
              setElapsed(0)
              setTimedOut(false)
              setPolling(true)
            }}
            className="mt-1 cursor-pointer font-mono text-[11px] font-bold text-wm-accent hover:underline"
          >
            Retry verification
          </button>
        </div>
      )}

      <div className="flex items-center gap-3">
        <AuthButton variant="secondary" icon={<ArrowLeft className="h-4 w-4" />} onClick={onBack}>
          Back
        </AuthButton>
        {dns?.verified && (
          <AuthButton onClick={onNext} trailingIcon={<ArrowRight className="h-4 w-4" />}>
            Continue
          </AuthButton>
        )}
      </div>
    </AuthCard>
  )
}
