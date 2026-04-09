'use client'

import { useState } from 'react'
import { Cloud, Settings2, ArrowLeft } from 'lucide-react'
import { StepDnsCloudflare } from './step-dns-cloudflare'
import { StepDnsManual } from './step-dns-manual'
import { StepDnsVerification } from './step-dns-verification'

type DnsRecord = { type: string; name: string; value: string; priority?: number; verified: boolean }

type DnsView = 'choose' | 'cloudflare' | 'manual' | 'verifying'

interface StepDnsProps {
  domain: string
  records: DnsRecord[]
  onNext: () => void
  onBack: () => void
}

export function StepDns({ domain, records, onNext, onBack }: StepDnsProps) {
  const [view, setView] = useState<DnsView>('choose')

  if (view === 'cloudflare') {
    return (
      <StepDnsCloudflare
        onStartVerification={() => setView('verifying')}
        onBack={() => setView('choose')}
      />
    )
  }

  if (view === 'manual') {
    return (
      <StepDnsManual
        domain={domain}
        records={records}
        onStartVerification={() => setView('verifying')}
        onBack={() => setView('choose')}
      />
    )
  }

  if (view === 'verifying') {
    return (
      <StepDnsVerification
        onNext={onNext}
        onBack={() => setView('choose')}
      />
    )
  }

  // Choose view
  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-2xl font-semibold text-wm-text-primary">Configure DNS records</h2>
      <p className="font-mono text-xs text-wm-text-tertiary">
        Set up DNS records for <span className="text-wm-accent">{domain}</span>. Choose how you&apos;d like to configure them.
      </p>

      <div className="flex flex-col gap-3">
        {/* Cloudflare option */}
        <button
          onClick={() => setView('cloudflare')}
          className="group flex cursor-pointer items-center gap-4 border border-wm-border bg-wm-surface p-5 text-left transition-all hover:border-wm-accent"
        >
          <div className="flex h-12 w-12 items-center justify-center border border-wm-border group-hover:border-wm-accent">
            <Cloud className="h-6 w-6 text-wm-text-muted group-hover:text-wm-accent" />
          </div>
          <div className="flex-1">
            <p className="font-mono text-sm font-semibold text-wm-text-primary group-hover:text-wm-accent">
              Connect with Cloudflare
            </p>
            <p className="font-mono text-[10px] text-wm-text-muted">
              Automatically configure all DNS records with one click
            </p>
          </div>
          <span className="font-mono text-[10px] font-semibold text-wm-accent opacity-0 transition-opacity group-hover:opacity-100">
            Recommended
          </span>
        </button>

        {/* Manual option */}
        <button
          onClick={() => setView('manual')}
          className="group flex cursor-pointer items-center gap-4 border border-wm-border bg-wm-surface p-5 text-left transition-all hover:border-wm-text-secondary"
        >
          <div className="flex h-12 w-12 items-center justify-center border border-wm-border group-hover:border-wm-text-secondary">
            <Settings2 className="h-6 w-6 text-wm-text-muted group-hover:text-wm-text-secondary" />
          </div>
          <div className="flex-1">
            <p className="font-mono text-sm font-semibold text-wm-text-primary">
              Manual Configuration
            </p>
            <p className="font-mono text-[10px] text-wm-text-muted">
              Copy DNS records to your provider manually
            </p>
          </div>
        </button>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="flex cursor-pointer items-center gap-1 font-mono text-xs text-wm-text-muted hover:text-wm-text-secondary"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </button>
      </div>
    </div>
  )
}
