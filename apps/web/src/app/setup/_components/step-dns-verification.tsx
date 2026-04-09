'use client'

import { useState, useEffect, useRef } from 'react'
import { Check, Loader2, Clock, ArrowRight, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api-client'

type DnsStatus = { mx: boolean; spf: boolean; dkim: boolean; dmarc: boolean; verified: boolean }

interface StepDnsVerificationProps {
  onNext: () => void
  onBack: () => void
}

const RECORDS = [
  { key: 'mx' as const, label: 'MX', desc: 'Mail exchange record' },
  { key: 'spf' as const, label: 'SPF', desc: 'Sender policy framework' },
  { key: 'dkim' as const, label: 'DKIM', desc: 'DomainKeys identified mail' },
  { key: 'dmarc' as const, label: 'DMARC', desc: 'Domain-based message auth' },
]

export function StepDnsVerification({ onNext, onBack }: StepDnsVerificationProps) {
  const [dnsStatus, setDnsStatus] = useState<DnsStatus | null>(null)
  const [isPolling, setIsPolling] = useState(true)
  const [elapsed, setElapsed] = useState(0)
  const [timedOut, setTimedOut] = useState(false)
  const startTime = useRef(Date.now())

  useEffect(() => {
    if (!isPolling) return

    async function check() {
      try {
        const res = await api.post<DnsStatus>('/api/v1/setup/domain/verify')
        setDnsStatus(res)
        if (res.verified) {
          setIsPolling(false)
        }
      } catch {}
    }

    // Initial check
    check()

    const pollId = setInterval(check, 10_000)
    const tickId = setInterval(() => {
      const s = Math.floor((Date.now() - startTime.current) / 1000)
      setElapsed(s)
      if (s > 1800) {
        setTimedOut(true)
        setIsPolling(false)
      }
    }, 1000)

    return () => {
      clearInterval(pollId)
      clearInterval(tickId)
    }
  }, [isPolling])

  const verifiedCount = dnsStatus
    ? [dnsStatus.mx, dnsStatus.spf, dnsStatus.dkim, dnsStatus.dmarc].filter(Boolean).length
    : 0

  const minutes = Math.floor(elapsed / 60)
  const seconds = elapsed % 60
  const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-2xl font-semibold text-wm-text-primary">Verifying DNS records</h2>
      <p className="font-mono text-xs text-wm-text-tertiary">
        Checking DNS propagation... This may take a few minutes.
      </p>

      {/* Progress bar */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="font-mono text-xs text-wm-text-secondary">{verifiedCount}/4 records verified</span>
          <span className="font-mono text-xs text-wm-text-muted">{timeStr} elapsed</span>
        </div>
        <div className="h-1 w-full bg-wm-border">
          <div
            className="h-1 bg-wm-accent transition-all duration-500"
            style={{ width: `${(verifiedCount / 4) * 100}%` }}
          />
        </div>
      </div>

      {/* Record statuses */}
      <div className="flex flex-col gap-2">
        {RECORDS.map((record) => {
          const isVerified = dnsStatus?.[record.key] ?? false
          return (
            <div
              key={record.key}
              className="flex items-center gap-3 border border-wm-border bg-wm-surface px-4 py-3"
            >
              <div className="flex h-8 w-8 items-center justify-center">
                {isVerified ? (
                  <Check className="h-5 w-5 text-wm-accent" />
                ) : isPolling ? (
                  <Loader2 className="h-5 w-5 animate-spin text-wm-text-muted" />
                ) : (
                  <Clock className="h-5 w-5 text-wm-warning" />
                )}
              </div>
              <div className="flex-1">
                <p className="font-mono text-sm font-medium text-wm-text-primary">{record.label}</p>
                <p className="font-mono text-[10px] text-wm-text-muted">{record.desc}</p>
              </div>
              <span
                className={`font-mono text-[10px] font-semibold ${isVerified ? 'text-wm-accent' : 'text-wm-warning'}`}
              >
                {isVerified ? 'Verified' : 'Pending'}
              </span>
            </div>
          )
        })}
      </div>

      {timedOut && (
        <div className="border border-wm-warning/30 bg-wm-warning/5 p-4">
          <p className="font-mono text-xs text-wm-warning">
            DNS propagation is taking longer than expected. Please check your DNS provider and ensure all records are configured correctly.
          </p>
          <button
            onClick={() => {
              startTime.current = Date.now()
              setElapsed(0)
              setTimedOut(false)
              setIsPolling(true)
            }}
            className="mt-2 cursor-pointer font-mono text-xs text-wm-accent hover:underline"
          >
            Retry verification
          </button>
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button variant="secondary" icon={<ArrowLeft className="h-4 w-4" />} onClick={onBack}>
          Back
        </Button>
        {dnsStatus?.verified && (
          <Button variant="primary" icon={<ArrowRight className="h-4 w-4" />} onClick={onNext}>
            Continue
          </Button>
        )}
      </div>
    </div>
  )
}
