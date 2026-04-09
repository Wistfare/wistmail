'use client'

import { useState } from 'react'
import { Copy, Check } from 'lucide-react'

interface DnsRecordRowProps {
  type: string
  name: string
  value: string
  priority?: number
  verified?: boolean
}

export function DnsRecordRow({ type, name, value, priority, verified }: DnsRecordRowProps) {
  const [copied, setCopied] = useState<'name' | 'value' | null>(null)

  const typeLabel =
    type === 'MX'
      ? 'MX'
      : name.includes('_domainkey')
        ? 'DKIM'
        : name.includes('_dmarc')
          ? 'DMARC'
          : 'SPF'

  function copy(text: string, field: 'name' | 'value') {
    navigator.clipboard.writeText(text)
    setCopied(field)
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <div className="border border-wm-border bg-wm-surface p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={`font-mono text-[10px] font-bold ${
              typeLabel === 'MX' ? 'text-wm-info' : typeLabel === 'DKIM' ? 'text-wm-warning' : typeLabel === 'SPF' ? 'text-wm-accent' : 'text-wm-error'
            }`}
          >
            {typeLabel}
          </span>
          <span className="font-mono text-[10px] text-wm-text-muted">{type}</span>
          {priority !== undefined && (
            <span className="font-mono text-[10px] text-wm-text-muted">Priority: {priority}</span>
          )}
        </div>
        {verified !== undefined && (
          <span
            className={`font-mono text-[10px] font-semibold ${verified ? 'text-wm-accent' : 'text-wm-warning'}`}
          >
            {verified ? '● Verified' : '● Pending'}
          </span>
        )}
      </div>

      <div className="mb-2 flex items-center gap-2">
        <span className="font-mono text-[10px] text-wm-text-muted">Name</span>
        <code className="flex-1 truncate font-mono text-xs text-wm-text-primary">{name}</code>
        <button onClick={() => copy(name, 'name')} className="cursor-pointer text-wm-text-muted hover:text-wm-text-secondary">
          {copied === 'name' ? <Check className="h-3.5 w-3.5 text-wm-accent" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>

      <div className="flex items-center gap-2">
        <span className="font-mono text-[10px] text-wm-text-muted">Value</span>
        <code className="flex-1 truncate font-mono text-xs text-wm-text-primary">{value}</code>
        <button onClick={() => copy(value, 'value')} className="cursor-pointer text-wm-text-muted hover:text-wm-text-secondary">
          {copied === 'value' ? <Check className="h-3.5 w-3.5 text-wm-accent" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  )
}
