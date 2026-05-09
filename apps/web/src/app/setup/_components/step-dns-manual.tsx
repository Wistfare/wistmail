'use client'

import { useMemo, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { cn } from '@/lib/utils'

type DnsRecord = {
  type: string
  name: string
  value: string
  priority?: number
  verified: boolean
}

interface StepDnsManualProps {
  domain: string
  records: DnsRecord[]
  onStartVerification: () => void
  onBack: () => void
}

/**
 * `/setup` step 2 (manual flow) — Pencil reference: `Screen/SetupV3-DNS-Manual` (`CXgQ0`).
 *
 * formPane (gap 24 vertical):
 *   fHd: "STEP 2 · DNS · MANUAL" eyebrow + "Manual DNS configuration" + desc
 *   listHd (justify between):
 *     "DNS RECORDS · 4" 9/700 #6e6e6e tracking 1.5
 *     copyAll: copy 11×11 lime + "COPY ALL RECORDS" 9/700 lime tracking 1.5
 *   {mxRec, spfRec, dkRec, dmRec} — each: radius 12, fill #111, padding [12,14],
 *     gap 8 vertical, 1px #1A1A1A stroke
 *       header (justify between):
 *         label group: "MX" 11/700 record-color tracking 1 + desc 10/500 #6e6e6e
 *         status pill: 6×6 dot + "PENDING"/"VERIFIED" 9/700 tracking 1
 *       kv row (gap 14):
 *         NAME col (width 120, gap 3): "NAME" 8/700 tracking 1.5 #404040 + value 12/600 white
 *         VALUE col (gap 3): same shape
 *         action icon: copy 13×13 #6e6e6e (or check 13×13 lime when verified)
 *   verBtn: 50h, lime, "START VERIFICATION" 12/700 black tracking 2
 */
export function StepDnsManual({
  domain,
  records,
  onStartVerification,
  onBack,
}: StepDnsManualProps) {
  const [copiedAll, setCopiedAll] = useState(false)

  const enriched = useMemo(() => enrichRecords(records), [records])

  function copyAll() {
    const text = enriched
      .map(
        (r) =>
          `${r.label} (${r.rawType})\nName: ${r.name}\nValue: ${r.value}${
            r.priority !== undefined ? `\nPriority: ${r.priority}` : ''
          }`,
      )
      .join('\n\n')
    navigator.clipboard.writeText(text)
    setCopiedAll(true)
    setTimeout(() => setCopiedAll(false), 2000)
  }

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
          Step 2 · DNS · Manual
        </p>
        <h1
          className="font-mono font-bold leading-tight text-wm-text-primary"
          style={{ fontSize: 30 }}
        >
          Manual DNS configuration
        </h1>
        <p
          className="font-mono font-medium"
          style={{ fontSize: 13, lineHeight: 1.6, color: '#6e6e6e' }}
        >
          Add these records to your DNS provider for {domain}. Changes take a
          few minutes to propagate.
        </p>
      </div>

      {/* listHd */}
      <div className="flex w-full items-center justify-between">
        <span
          className="font-mono font-bold uppercase"
          style={{ fontSize: 9, letterSpacing: 1.5, color: '#6e6e6e' }}
        >
          DNS records · {enriched.length}
        </span>
        <button
          type="button"
          onClick={copyAll}
          className="inline-flex cursor-pointer items-center font-mono font-bold uppercase text-wm-accent transition-opacity hover:opacity-80"
          style={{ gap: 6, fontSize: 9, letterSpacing: 1.5 }}
        >
          {copiedAll ? (
            <Check style={{ width: 11, height: 11 }} aria-hidden />
          ) : (
            <Copy style={{ width: 11, height: 11 }} aria-hidden />
          )}
          {copiedAll ? 'Copied' : 'Copy all records'}
        </button>
      </div>

      {/* records */}
      {enriched.map((r, i) => (
        <RecordCard key={i} record={r} />
      ))}

      {/* btnRow */}
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
        <button
          type="button"
          onClick={onStartVerification}
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
          Start verification
        </button>
      </div>
    </div>
  )
}

interface EnrichedRecord {
  label: 'MX' | 'SPF' | 'DKIM' | 'DMARC'
  color: string
  description: string
  rawType: string
  name: string
  value: string
  priority?: number
  verified: boolean
}

function enrichRecords(rs: DnsRecord[]): EnrichedRecord[] {
  return rs.map((r) => {
    const label =
      r.type === 'MX'
        ? 'MX'
        : r.name.includes('_domainkey')
          ? 'DKIM'
          : r.name.includes('_dmarc')
            ? 'DMARC'
            : 'SPF'
    return {
      label,
      color:
        label === 'MX'
          ? '#3B82F6'
          : label === 'SPF'
            ? '#BFFF00'
            : label === 'DKIM'
              ? '#F59E0B'
              : '#FF4D8B',
      description:
        label === 'MX'
          ? `Mail exchange${r.priority !== undefined ? ` · Priority ${r.priority}` : ''}`
          : label === 'SPF'
            ? 'Sender policy framework'
            : label === 'DKIM'
              ? 'DomainKeys identified mail'
              : 'Domain-based message auth',
      rawType: r.type,
      name: r.name,
      value: r.value,
      priority: r.priority,
      verified: r.verified,
    }
  })
}

function RecordCard({ record }: { record: EnrichedRecord }) {
  const [copied, setCopied] = useState(false)

  function copyValue() {
    navigator.clipboard.writeText(record.value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div
      className="flex w-full flex-col bg-wm-surface"
      style={{
        borderRadius: 12,
        padding: '12px 14px',
        gap: 8,
        border: '1px solid var(--color-wm-border)',
      }}
    >
      {/* header row */}
      <div className="flex w-full items-center justify-between">
        <div className="flex items-center" style={{ gap: 8 }}>
          <span
            className="font-mono font-bold uppercase"
            style={{ fontSize: 11, letterSpacing: 1, color: record.color }}
          >
            {record.label}
          </span>
          <span
            className="font-mono font-medium"
            style={{ fontSize: 10, color: '#6e6e6e' }}
          >
            {record.description}
          </span>
        </div>
        <StatusPill verified={record.verified} />
      </div>

      {/* kv row */}
      <div className="flex w-full items-end" style={{ gap: 14 }}>
        <KvCol label="Name" value={record.name} width={120} />
        <KvCol label="Value" value={record.value} grow />
        <button
          type="button"
          onClick={copyValue}
          aria-label={copied ? 'Copied' : 'Copy value'}
          className="cursor-pointer"
          style={{ color: record.verified ? '#BFFF00' : '#6e6e6e' }}
        >
          {record.verified ? (
            <Check style={{ width: 13, height: 13 }} aria-hidden />
          ) : (
            <Copy style={{ width: 13, height: 13 }} aria-hidden />
          )}
        </button>
      </div>
    </div>
  )
}

function KvCol({
  label,
  value,
  width,
  grow,
}: {
  label: string
  value: string | number
  width?: number
  grow?: boolean
}) {
  return (
    <div
      className={cn('flex flex-col', grow && 'min-w-0 flex-1')}
      style={{ gap: 3, width }}
    >
      <span
        className="font-mono font-bold uppercase"
        style={{ fontSize: 8, letterSpacing: 1.5, color: '#404040' }}
      >
        {label}
      </span>
      <span
        className="truncate font-mono font-semibold text-wm-text-primary"
        style={{ fontSize: 12 }}
        title={String(value)}
      >
        {value}
      </span>
    </div>
  )
}

function StatusPill({ verified }: { verified: boolean }) {
  const color = verified ? '#BFFF00' : '#F59E0B'
  return (
    <span className="inline-flex items-center" style={{ gap: 5 }}>
      <span
        aria-hidden
        className="block rounded-full"
        style={{ width: 6, height: 6, background: color }}
      />
      <span
        className="font-mono font-bold uppercase"
        style={{ fontSize: 9, letterSpacing: 1, color }}
      >
        {verified ? 'Verified' : 'Pending'}
      </span>
    </span>
  )
}
