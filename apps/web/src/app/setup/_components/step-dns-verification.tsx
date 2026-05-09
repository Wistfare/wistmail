'use client'

import { useEffect, useRef, useState } from 'react'
import { AlarmClock, Check, Loader2 } from 'lucide-react'
import { api } from '@/lib/api-client'
import { cn } from '@/lib/utils'

type DnsStatus = {
  mx: boolean
  spf: boolean
  dkim: boolean
  dmarc: boolean
  verified: boolean
}

interface StepDnsVerificationProps {
  onNext: () => void
  onBack: () => void
}

/**
 * `/setup` step 2 (verifying) — Pencil reference: `Screen/SetupV3-DNS-Verify` (`u5uqW`).
 *
 * form (gap 24):
 *   fHd: "STEP 2 · DNS · VERIFYING" + "Verifying DNS records" + desc
 *   progSec: radius 12, fill #111, 1px #1A1A1A, padding [16,18], gap 12 vertical
 *     header row (justify between):
 *       progHL (gap 8): "1 / 4" 14/700 lime + "RECORDS VERIFIED" 9/700 #6e6e6e tracking 1.5
 *       progHR (gap 6): alarm 11×11 #6e6e6e + "2:14 ELAPSED" 10/700 #6e6e6e tracking 1
 *     progBar: bg #000, h 4, radius 2 — child rect lime, width = % of total
 *   recList (gap 8):
 *     each row: radius 10, fill #111, 1px #1A1A1A, padding [12,16], gap 12
 *       30×30 status tile (radius 8):
 *         verified  → bg #1A2200, 1px lime, check 14×14 lime
 *         pending   → bg #000, 1px #1A1A1A, alarm 14×14 #F59E0B
 *         loading   → bg #000, 1px #1A1A1A, loader 14×14 #999
 *       col (gap 2):
 *         row1: "MX"/"SPF"/etc 11/700 record-color tracking 1
 *               + record description 13/600 white
 *         row2: status caption 10/500 #6e6e6e
 *       status pill (radius 12, padding [3,8], gap 5, alignItems center):
 *         verified → fill #1A2200, lime dot 6×6 + "VERIFIED" 9/700 lime tracking 1
 *         pending  → fill #3A2A0A, amber dot + "PENDING" 9/700 amber tracking 1
 *   fbtnRow: cancel/back button — 50h radius 12, fill #111, 1px #1A1A1A,
 *     "WAITING FOR DNS"/"CONTINUE"/etc.
 */
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
        /* keep polling */
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
  const total = 4
  const minutes = Math.floor(elapsed / 60)
  const seconds = elapsed % 60
  const timeLabel = `${minutes}:${seconds.toString().padStart(2, '0')}`

  type RecordKey = 'mx' | 'spf' | 'dkim' | 'dmarc'
  type Row = {
    key: RecordKey
    label: string
    color: string
    title: string
    pendingCaption: string
    verifiedCaption: string
  }

  const rows: Row[] = [
    {
      key: 'mx',
      label: 'MX',
      color: '#3B82F6',
      title: 'Mail exchange record',
      pendingCaption: 'Checking propagation…',
      verifiedCaption: 'Resolves to mail.',
    },
    {
      key: 'spf',
      label: 'SPF',
      color: '#BFFF00',
      title: 'Sender policy framework',
      pendingCaption: 'Checking propagation…',
      verifiedCaption: 'Sender policy aligned',
    },
    {
      key: 'dkim',
      label: 'DKIM',
      color: '#F59E0B',
      title: 'DomainKeys identified mail',
      pendingCaption: 'Waiting for propagation',
      verifiedCaption: 'DKIM signing verified',
    },
    {
      key: 'dmarc',
      label: 'DMARC',
      color: '#FF4D8B',
      title: 'Domain-based message auth',
      pendingCaption: 'Waiting for propagation',
      verifiedCaption: 'DMARC policy enforced',
    },
  ]

  // Pencil shows the next-pending row with a loader spinner while the
  // already-verified rows show a check and the rest show alarm+amber.
  // We approximate that by treating the first non-verified row as "loading".
  const firstPendingIdx = rows.findIndex((r) => !(dns?.[r.key] ?? false))

  return (
    <div
      className="mx-auto flex w-full max-w-[520px] flex-col"
      style={{ gap: 24 }}
    >
      {/* fHd */}
      <div className="flex w-full flex-col" style={{ gap: 8 }}>
        <p
          className="font-mono font-bold uppercase text-wm-accent"
          style={{ fontSize: 11, letterSpacing: 2 }}
        >
          Step 2 · DNS · Verifying
        </p>
        <h1
          className="font-mono font-bold leading-tight text-wm-text-primary"
          style={{ fontSize: 30 }}
        >
          Verifying DNS records
        </h1>
        <p
          className="font-mono font-medium"
          style={{ fontSize: 13, lineHeight: 1.6, color: '#6e6e6e' }}
        >
          Checking DNS propagation… This may take a few minutes.
        </p>
      </div>

      {/* progSec */}
      <div
        className="flex w-full flex-col bg-wm-surface"
        style={{
          borderRadius: 12,
          border: '1px solid var(--color-wm-border)',
          padding: '16px 18px',
          gap: 12,
        }}
      >
        <div className="flex w-full items-center justify-between">
          <div className="flex items-center" style={{ gap: 8 }}>
            <span
              className="font-mono font-bold text-wm-accent"
              style={{ fontSize: 14 }}
            >
              {verifiedCount} / {total}
            </span>
            <span
              className="font-mono font-bold uppercase"
              style={{ fontSize: 9, letterSpacing: 1.5, color: '#6e6e6e' }}
            >
              records verified
            </span>
          </div>
          <div className="flex items-center" style={{ gap: 6 }}>
            <AlarmClock
              aria-hidden
              style={{ width: 11, height: 11, color: '#6e6e6e' }}
            />
            <span
              className="font-mono font-bold uppercase"
              style={{ fontSize: 10, letterSpacing: 1, color: '#6e6e6e' }}
            >
              {timeLabel} elapsed
            </span>
          </div>
        </div>
        <div
          className="w-full bg-wm-bg"
          style={{ height: 4, borderRadius: 2, overflow: 'hidden' }}
        >
          <div
            className="h-full bg-wm-accent transition-all"
            style={{ width: `${(verifiedCount / total) * 100}%` }}
          />
        </div>
      </div>

      {/* recList */}
      <div className="flex w-full flex-col" style={{ gap: 8 }}>
        {rows.map((r, idx) => {
          const verified = dns?.[r.key] ?? false
          const isLoading = !verified && idx === firstPendingIdx && polling
          return <VerifyRow key={r.key} row={r} verified={verified} loading={isLoading} />
        })}
      </div>

      {/* fbtnRow */}
      <div className="flex w-full" style={{ paddingTop: 8, gap: 10 }}>
        <button
          type="button"
          onClick={onBack}
          className="flex cursor-pointer items-center justify-center font-mono font-bold uppercase text-wm-text-secondary transition-colors hover:text-wm-text-primary"
          style={{
            height: 50,
            borderRadius: 12,
            fontSize: 11,
            letterSpacing: 2,
            padding: '0 18px',
            border: '1px solid var(--color-wm-border)',
          }}
        >
          Back
        </button>
        {dns?.verified ? (
          <button
            type="button"
            onClick={onNext}
            className={cn(
              'flex flex-1 cursor-pointer items-center justify-center font-mono font-bold uppercase',
              'bg-wm-accent text-wm-text-on-accent transition-colors hover:bg-wm-accent-hover',
            )}
            style={{
              height: 50,
              borderRadius: 12,
              fontSize: 12,
              letterSpacing: 2,
              boxShadow: '0 6px 24px 0 rgba(191,255,0,0.25)',
            }}
          >
            Continue
          </button>
        ) : (
          <button
            type="button"
            disabled
            className="flex flex-1 cursor-not-allowed items-center justify-center bg-wm-surface font-mono font-bold uppercase"
            style={{
              height: 50,
              borderRadius: 12,
              fontSize: 12,
              letterSpacing: 2,
              border: '1px solid var(--color-wm-border)',
              color: '#6e6e6e',
            }}
          >
            {timedOut ? 'Verification timed out' : 'Waiting for DNS'}
          </button>
        )}
      </div>
    </div>
  )
}

function VerifyRow({
  row,
  verified,
  loading,
}: {
  row: {
    key: 'mx' | 'spf' | 'dkim' | 'dmarc'
    label: string
    color: string
    title: string
    pendingCaption: string
    verifiedCaption: string
  }
  verified: boolean
  loading: boolean
}) {
  // Status tile palette (Pencil exact):
  const tileBg = verified ? '#1A2200' : '#000000'
  const tileBorder = verified ? 'var(--color-wm-accent)' : 'var(--color-wm-border)'
  const tileIconColor = verified ? '#BFFF00' : loading ? '#999999' : '#F59E0B'
  // Status pill palette:
  const pillBg = verified ? '#1A2200' : '#3A2A0A'
  const pillColor = verified ? '#BFFF00' : '#F59E0B'

  return (
    <div
      className="flex w-full items-center bg-wm-surface"
      style={{
        borderRadius: 10,
        padding: '12px 16px',
        gap: 12,
        border: '1px solid var(--color-wm-border)',
      }}
    >
      <span
        aria-hidden
        className="flex shrink-0 items-center justify-center"
        style={{
          width: 30,
          height: 30,
          borderRadius: 8,
          background: tileBg,
          border: `1px solid ${tileBorder}`,
        }}
      >
        {verified ? (
          <Check style={{ width: 14, height: 14, color: tileIconColor }} />
        ) : loading ? (
          <Loader2
            className="animate-spin"
            style={{ width: 14, height: 14, color: tileIconColor }}
          />
        ) : (
          <AlarmClock style={{ width: 14, height: 14, color: tileIconColor }} />
        )}
      </span>

      <div className="flex flex-1 flex-col" style={{ gap: 2 }}>
        <div className="flex items-center" style={{ gap: 8 }}>
          <span
            className="font-mono font-bold uppercase"
            style={{ fontSize: 11, letterSpacing: 1, color: row.color }}
          >
            {row.label}
          </span>
          <span
            className="font-mono font-semibold text-wm-text-primary"
            style={{ fontSize: 13 }}
          >
            {row.title}
          </span>
        </div>
        <span
          className="font-mono font-medium"
          style={{ fontSize: 10, color: '#6e6e6e' }}
        >
          {verified ? row.verifiedCaption : row.pendingCaption}
        </span>
      </div>

      <span
        className="inline-flex items-center"
        style={{
          gap: 5,
          padding: '3px 8px',
          borderRadius: 12,
          background: pillBg,
        }}
      >
        <span
          aria-hidden
          className="block rounded-full"
          style={{ width: 6, height: 6, background: pillColor }}
        />
        <span
          className="font-mono font-bold uppercase"
          style={{ fontSize: 9, letterSpacing: 1, color: pillColor }}
        >
          {verified ? 'Verified' : 'Pending'}
        </span>
      </span>
    </div>
  )
}
