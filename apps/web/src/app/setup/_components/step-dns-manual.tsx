'use client'

import { useState } from 'react'
import { ArrowLeft, Copy, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DnsRecordRow } from './dns-record-row'

type DnsRecord = { type: string; name: string; value: string; priority?: number; verified: boolean }

interface StepDnsManualProps {
  domain: string
  records: DnsRecord[]
  onStartVerification: () => void
  onBack: () => void
}

export function StepDnsManual({ domain, records, onStartVerification, onBack }: StepDnsManualProps) {
  const [allCopied, setAllCopied] = useState(false)

  function copyAll() {
    const text = records
      .map((r) => {
        const typeLabel =
          r.type === 'MX'
            ? 'MX'
            : r.name.includes('_domainkey')
              ? 'DKIM'
              : r.name.includes('_dmarc')
                ? 'DMARC'
                : 'SPF'
        return `${typeLabel} (${r.type})\nName: ${r.name}\nValue: ${r.value}${r.priority !== undefined ? `\nPriority: ${r.priority}` : ''}`
      })
      .join('\n\n')

    navigator.clipboard.writeText(text)
    setAllCopied(true)
    setTimeout(() => setAllCopied(false), 2000)
  }

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-2xl font-semibold text-wm-text-primary">Manual DNS Configuration</h2>
      <p className="font-mono text-xs text-wm-text-tertiary">
        Add these records to your DNS provider for <span className="text-wm-accent">{domain}</span>
      </p>

      <div className="flex items-center justify-end">
        <button
          onClick={copyAll}
          className="flex cursor-pointer items-center gap-1 font-mono text-xs text-wm-text-muted hover:text-wm-accent"
        >
          {allCopied ? <Check className="h-3.5 w-3.5 text-wm-accent" /> : <Copy className="h-3.5 w-3.5" />}
          {allCopied ? 'Copied all' : 'Copy all records'}
        </button>
      </div>

      <div className="flex flex-col gap-3">
        {records.map((record, idx) => (
          <DnsRecordRow
            key={idx}
            type={record.type}
            name={record.name}
            value={record.value}
            priority={record.priority}
          />
        ))}
      </div>

      <div className="border border-wm-border/30 bg-wm-surface p-4">
        <p className="font-mono text-[10px] text-wm-text-muted">
          After adding all records to your DNS provider, click &quot;Start Verification&quot; below.
          DNS changes can take up to 48 hours to propagate, but typically complete within a few minutes.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Button variant="secondary" icon={<ArrowLeft className="h-4 w-4" />} onClick={onBack}>
          Back
        </Button>
        <Button variant="primary" onClick={onStartVerification}>
          Start Verification
        </Button>
      </div>
    </div>
  )
}
