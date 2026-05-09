'use client'

import { useState } from 'react'
import { ChevronRight, Cloud, Settings2 } from 'lucide-react'
import {
  AuthCard,
  AuthHeading,
} from '@/components/auth'
import { StepDnsCloudflare } from './step-dns-cloudflare'
import { StepDnsManual } from './step-dns-manual'
import { StepDnsVerification } from './step-dns-verification'

type DnsRecord = { type: string; name: string; value: string; priority?: number; verified: boolean }

type DnsView = 'choose' | 'cloudflare' | 'manual' | 'verifying'

interface StepDnsProps {
  domain: string
  records: DnsRecord[]
  onNext: () => void
}

/** Pencil reference: `SetupV3-DNS-Choose` (`iYWpV`). */
export function StepDns({ domain, records, onNext }: StepDnsProps) {
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
    return <StepDnsVerification onNext={onNext} onBack={() => setView('choose')} />
  }

  return (
    <AuthCard>
      <AuthHeading
        eyebrow="Step 2 · DNS"
        title="Configure DNS records"
        description={`Set up DNS records for ${domain}. Choose how you'd like to configure them.`}
      />

      <div className="flex flex-col gap-3">
        {/* Recommended: Cloudflare auto-config */}
        <button
          type="button"
          onClick={() => setView('cloudflare')}
          className="group relative flex items-center gap-4 rounded-[14px] border border-wm-accent bg-wm-accent-dim px-5 py-4 text-left transition-colors"
          style={{ boxShadow: '0 6px 20px 0 rgba(191,255,0,0.12)' }}
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-[12px] bg-wm-accent text-wm-text-on-accent">
            <Cloud className="h-5 w-5" />
          </span>
          <span className="flex flex-1 flex-col gap-0.5">
            <span className="flex items-center gap-2">
              <span className="font-mono text-[13px] font-bold text-wm-accent">
                Connect with Cloudflare
              </span>
              <span className="rounded-full border border-wm-accent/40 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[1.5px] text-wm-accent">
                Recommended
              </span>
            </span>
            <span className="font-mono text-[11px] text-wm-text-tertiary">
              Automatically configure all DNS records with one click.
            </span>
          </span>
          <ChevronRight className="h-4 w-4 text-wm-accent" />
        </button>

        {/* Manual */}
        <button
          type="button"
          onClick={() => setView('manual')}
          className="group flex items-center gap-4 rounded-[14px] border border-wm-border bg-wm-surface px-5 py-4 text-left transition-colors hover:border-wm-text-tertiary"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-[12px] border border-wm-border bg-wm-bg text-wm-text-secondary">
            <Settings2 className="h-5 w-5" />
          </span>
          <span className="flex flex-1 flex-col gap-0.5">
            <span className="font-mono text-[13px] font-bold text-wm-text-primary">
              Manual configuration
            </span>
            <span className="font-mono text-[11px] text-wm-text-tertiary">
              Copy DNS records to your provider manually.
            </span>
          </span>
          <ChevronRight className="h-4 w-4 text-wm-text-tertiary" />
        </button>
      </div>
    </AuthCard>
  )
}
