'use client'

import { useState } from 'react'
import { ArrowLeft, ArrowRight, Check, Copy } from 'lucide-react'
import {
  AuthButton,
  AuthCard,
  AuthHeading,
} from '@/components/auth'
import { DnsRecordRow } from './dns-record-row'

type DnsRecord = { type: string; name: string; value: string; priority?: number; verified: boolean }

interface StepDnsManualProps {
  domain: string
  records: DnsRecord[]
  onStartVerification: () => void
  onBack: () => void
}

/** Pencil reference: `SetupV3-DNS-Manual` (`CXgQ0`). */
export function StepDnsManual({
  domain,
  records,
  onStartVerification,
  onBack,
}: StepDnsManualProps) {
  const [copiedAll, setCopiedAll] = useState(false)

  function copyAll() {
    const text = records
      .map((r) => {
        const label =
          r.type === 'MX'
            ? 'MX'
            : r.name.includes('_domainkey')
              ? 'DKIM'
              : r.name.includes('_dmarc')
                ? 'DMARC'
                : 'SPF'
        return `${label} (${r.type})\nName: ${r.name}\nValue: ${r.value}${r.priority !== undefined ? `\nPriority: ${r.priority}` : ''}`
      })
      .join('\n\n')
    navigator.clipboard.writeText(text)
    setCopiedAll(true)
    setTimeout(() => setCopiedAll(false), 2000)
  }

  return (
    <AuthCard>
      <AuthHeading
        eyebrow="Step 2 · DNS · Manual"
        title="Manual DNS configuration"
        description={`Add these records to your DNS provider for ${domain}. Changes take a few minutes to propagate.`}
      />

      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] font-bold uppercase tracking-[1.5px] text-wm-text-tertiary">
          DNS records · {records.length}
        </span>
        <button
          type="button"
          onClick={copyAll}
          className="inline-flex cursor-pointer items-center gap-1.5 font-mono text-[11px] text-wm-text-secondary transition-colors hover:text-wm-accent"
        >
          {copiedAll ? <Check className="h-3.5 w-3.5 text-wm-accent" /> : <Copy className="h-3.5 w-3.5" />}
          {copiedAll ? 'Copied' : 'Copy all'}
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {records.map((r, idx) => (
          <DnsRecordRow
            key={idx}
            type={r.type}
            name={r.name}
            value={r.value}
            priority={r.priority}
          />
        ))}
      </div>

      <p className="font-mono text-[11px] text-wm-text-tertiary">
        After adding all records, click <span className="text-wm-accent">Start verification</span>.
        Propagation usually finishes in a few minutes but can take up to 48 hours.
      </p>

      <div className="flex items-center gap-3">
        <AuthButton variant="secondary" icon={<ArrowLeft className="h-4 w-4" />} onClick={onBack}>
          Back
        </AuthButton>
        <AuthButton onClick={onStartVerification} trailingIcon={<ArrowRight className="h-4 w-4" />}>
          Start verification
        </AuthButton>
      </div>
    </AuthCard>
  )
}
